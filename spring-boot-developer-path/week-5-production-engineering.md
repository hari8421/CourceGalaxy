---
title: "Week 5 — Production Engineering"
track: "spring"
week: 5
order: 5
type: "module"
hours: 18
summary: "Docker and multi-stage builds, CI pipelines, JVM and connection-pool tuning, profiling, resilience patterns, messaging with Kafka, and microservice boundaries."
tags: ["docker", "ci", "performance", "jvm", "resilience", "kafka", "microservices", "kubernetes"]
---

# Week 5 — Production Engineering

**Goal by Friday:** `library-service` runs as a container behind a health-checked pipeline,
with tuned JVM flags, a documented latency budget, and a resilience story for its
dependencies.

---

## 1. Concepts (3 h)

### 1.1 Containerising a Spring Boot app

```dockerfile
# ---- build stage ----
FROM eclipse-temurin:21-jdk AS build
WORKDIR /build
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -q dependency:go-offline          # cached layer: deps change rarely
COPY src src
RUN ./mvnw -q clean package -DskipTests

# ---- runtime stage ----
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd -r -u 10001 spring              # never run as root
COPY --from=build /build/target/*.jar app.jar

EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+UseZGC"
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD wget -qO- http://localhost:8080/actuator/health/readiness || exit 1
USER 10001
ENTRYPOINT ["java","-jar","/app/app.jar"]
```

Why each line matters:
- **Multi-stage** — the JRE image has no compiler, no Maven, no source. Smaller, fewer CVEs.
- **`dependency:go-offline`** — dependency downloads sit in a cached layer.
- **Non-root user** — a container escape should not start as root inside.
- **`MaxRAMPercentage`** — the JVM must know the container limit (cgroups v2), or it sizes
  the heap from host RAM and gets OOM-killed. **This is the single most common container
  bug.**
- **Readiness probe** — so traffic only arrives when the app can serve, not merely when the
  process started.

### 1.2 JVM flags worth knowing

| Flag | Why |
| --- | --- |
| `-XX:MaxRAMPercentage=75` | Heap sized to the container limit, not the host |
| `-XX:+UseZGC` / `Shenandoah` | Low pause times → predictable tail latency |
| `-XX:+HeapDumpOnOutOfMemoryError` | Get a heap dump *before* the crash |
| `-XX:StartFlightRecording=...` | JVM profiling in production, briefly |
| `-Xlog:gc*:file=/app/gc.log` | GC behaviour under load |

**Container detection:** since JDK 10 the JVM is container-aware *if* `UseContainerSupport`
is on (default). The problem is only when the runtime limit is unset or the app is given an
explicit `-Xmx` larger than the limit.

### 1.3 Build and run

```bash
./mvnw clean package                          # -> target/library-service-1.0.0.jar
java -jar target/library-service-1.0.0.jar --spring.profiles.active=prod
java -XX:MaxRAMPercentage=75 -jar app.jar    # in the container
```

**12-factor config:** the jar is identical across environments; only env vars and profile
files change.

### 1.4 CI that actually protects you

```yaml
name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16-alpine, env: { POSTGRES_PASSWORD: test }, ports: ['5432:5432'] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '21', cache: maven }
      - run: ./mvnw -B verify                       # tests + JaCoCo coverage gate
      - run: docker build -t library-service:${{ github.sha }} .
      - run: docker run -d -p 8080:8080 --name svc library-service:${{ github.sha }}
      - run: sleep 25 && curl -f localhost:8080/actuator/health/readiness
```

The last two steps — **build the image, run it, hit the health endpoint** — catch the class
of bugs (bad Dockerfile, missing env, wrong port) that a unit test suite never will.

```xml
<plugin>
  <groupId>org.jacoco</groupId><artifactId>jacoco-maven-plugin</artifactId>
  <version>0.8.12</version>
  <executions><execution>
    <goals><goal>check</goal></goals>
    <configuration><rules>
      <rule><element>BUNDLE</element><limits>
        <limit><counter>LINE</counter><value>COVEREDRATIO</value><minimum>0.60</minimum></limit>
      </limits></rule>
    </rules></configuration>
  </execution></executions>
</plugin>
```

### 1.5 Performance: method, in order

1. **Measure.** `/actuator/metrics`, SQL log, JFR, or a load test. Never guess.
2. **Look at the data layer first** — it is 80 % of latency. Check indexes (`EXPLAIN ANALYZE`),
   N+1 queries, and fetch sizes.
3. **Check the connection pool.** `hikaricp.connections.pending > 0` means threads are
   waiting on the database.
4. **Cache** the reads that repeat, at the right layer.
5. **Then** JVM flags, serialisation, and micro-optimisation.

```sql
EXPLAIN ANALYZE SELECT * FROM books WHERE lower(title) LIKE '%dune%';
-- Seq Scan on books  ->  add a functional index: CREATE INDEX ON books (lower(title));
```

**Connection pool sizing, roughly:** `connections ≈ cores × 2 + spindles`, bounded by what
PostgreSQL can serve. Default HikariCP is 10; a service with 200 threads and a pool of 10 is
a queue, not a pool.

### 1.6 Resilience for a service that calls other services

```java
@Service
@RequiredArgsConstructor
public class AvailabilityClient {

    private final RestClient client;
    private final CircuitBreakerFactory<?> breaker;

    public List<Copy> copiesFor(String isbn) {
        return breakerFactory(breaker).run(
            () -> client.get().uri("/copies/{isbn}", isbn).retrieve().body(new ParameterizedTypeReference<>() {}),
            throwable -> List.of());                 // graceful degradation, not a 500
    }
}
```

The patterns you should be able to name and use:

| Pattern | Use when |
| --- | --- |
| **Timeout** | Always. Every call, every time. No timeout = a thread pool waiting forever. |
| **Retry with backoff** | Idempotent operations, transient failures only |
| **Circuit breaker** | Dependency is down; fail fast instead of queueing |
| **Bulkhead** | One slow dependency must not exhaust your whole thread pool |
| **Fallback** | Degrade to a smaller answer rather than an error page |
| **Hedged requests** | Tail latency matters, duplicate cost is acceptable |

**Rule:** retries amplify incidents. Exponential backoff **with jitter**, a retry cap, and
only for idempotent operations.

### 1.7 Messaging: when the work must survive a restart

```java
@Service
@RequiredArgsConstructor
public class LoanEventPublisher {
    private final KafkaTemplate<String, LoanEvent> kafka;

    // The production-correct pattern: write the event in the SAME transaction as the state
    @Transactional
    public void loan(long bookId, long memberId) {
        var loan = loanRepository.save(new Loan(bookId, memberId));
        outbox.save(new OutboxEvent("loan.created", serialize(loan)));   // same tx, not Kafka
        return loan;
    }
}
```

**The outbox pattern.** Publishing to Kafka inside a `@Transactional` method is a lie: the
DB commit can fail after the message is sent, and now they disagree. Instead insert the event
into an outbox table in the same transaction, and have a relay publish it and mark it sent.
That gives you at-least-once delivery with no dual-write problem. Consumers must be
**idempotent** — deduplicate by event id.

**When you need a queue:** work that must not be lost, work that can be retried later, work
that fans out, and load smoothing. `@Async` is for "please do this soon if the JVM is still
alive"; it is not durability.

### 1.8 Microservice boundaries

**Split a service when** the domain boundaries are genuinely different, the scaling profiles
are different, or the teams are different. **Do not split** because a tutorial said to.

```text
   Split by domain:     catalog │ orders │ lending │ members
   Split by layer:      controllers │ services │ repositories   ← do NOT do this
```

Costs of splitting that people forget: distributed transactions, network failure everywhere,
end-to-end tracing, and deployment complexity. A well-modularised **modular monolith** is
the correct answer far more often than the industry admits.

```java
// Modular monolith: enforce boundaries in code, not the network
com.example.library.catalog    // may be imported by others
com.example.library.lending    // may NOT import com.example.library.catalog.internal
```

Enforce with **Spring Modulith** (`@ApplicationModule`, `ApplicationModules.verify()`) or
ArchUnit tests:

```java
@Test void lendingMustNotReachIntoCatalogInternals() {
    ArchRuleDefinition.noClasses()
        .that().resideInAPackage("..lending..")
        .should().dependOnClassesThat().resideInAPackage("..catalog..internal..")
        .check(new ClassFileImporter().importPackages("com.example.library"));
}
```

### 1.9 Deployment checklist

- [ ] Container image, non-root, health-checked
- [ ] Config from env vars; no secrets in the image or repo
- [ ] Liveness and readiness probes configured and correct
- [ ] Rolling deployment; old and new versions must both work with the current schema
- [ ] Backward-compatible migrations (add column → deploy code → backfill → drop old)
- [ ] Graceful shutdown: `server.shutdown=graceful`, `spring.lifecycle.timeout-per-shutdown-phase`
- [ ] Logs to stdout (the platform collects them), JSON if you have a log pipeline
- [ ] Metrics scraped (Micrometer → Prometheus)
- [ ] Alerts on: error rate, p95 latency, pool saturation, restart count

---

## 2. Lab — productionise `library-service` (the week's main build)

### 2.1 Containerise and prove it

```bash
docker build -t library-service:1.0 .
docker run -d -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=prod \
  -e SPRING_DATASOURCE_URL=jdbc:postgresql://host.docker.internal:5432/library \
  --memory=512m library-service:1.0
curl -f localhost:8080/actuator/health/readiness
```

Set `--memory=512m` **on purpose** — it proves `MaxRAMPercentage` works and that the app
does not get OOM-killed.

### 2.2 Load test and read the numbers

```bash
hey -n 5000 -c 50 -q 16 http://localhost:8080/api/v1/books
# or: k6 run script.js
```

Then, under load, look at:
- p95 latency and 5xx rate
- `hikaricp.connections.active` vs `max` — saturated means the pool is the bottleneck
- `jvm.gc.pause` — long pauses are hidden latency
- slow-query log — did one query dominate?

**Write down one bottleneck you found and one change that fixed it.** That sentence belongs
in your interview answers.

### 2.3 Add graceful shutdown and a Kubernetes manifest

```yaml
livenessProbe:
  httpGet: { path: /actuator/health/liveness, port: 8080 }
  initialDelaySeconds: 30
readinessProbe:
  httpGet: { path: /actuator/health/readiness, port: 8080 }
  periodSeconds: 5
```

The difference matters: **liveness** failure means "restart me"; **readiness** failure means
"stop sending traffic". Using the same probe for both causes restart storms during a
dependency outage.

---

## 3. Practical drills (3 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Build without a multistage Dockerfile; compare image size | Why it matters for pull/startup time |
| 2 | Remove `MaxRAMPercentage`; set `--memory=256m`; watch it die | Container-aware JVM |
| 3 | Kill the database mid-request; observe behaviour | Timeouts and circuit breakers |
| 4 | Load test, saturate HikariCP, then raise the pool | Pool sizing is empirical |
| 5 | Add `EXPLAIN ANALYZE` to your hottest query; add the missing index | Indexing is the cheapest speedup |
| 6 | Kill the pod/process mid-request; verify graceful shutdown | Draining in-flight requests |
| 7 | Enable Spring Modulith / an ArchUnit rule; break it | Boundaries you cannot test are not boundaries |

---

## 4. Deliverable — `library-service` v4 (production-grade)

- [ ] Multi-stage Dockerfile, non-root, health-checked, `--memory`-safe
- [ ] CI pipeline: build → test → coverage gate → image build → smoke test the health endpoint
- [ ] Graceful shutdown configured
- [ ] A load test with a recorded result, plus the bottleneck you found and fixed
- [ ] Resilience: timeouts on every outbound call, plus one circuit breaker
- [ ] Actuator + Prometheus endpoint, and a documented alerting list
- [ ] `README.md`: architecture diagram, run instructions, the load-test numbers, and an
  explicit "what I would do next"

---

## 5. Self-check

1. Why does `-XX:MaxRAMPercentage` exist, and what breaks without it?
2. Difference between liveness and readiness, and what happens if you use the same one?
3. Your API calls a service that is slow but not down. Which pattern saves you, and which
   makes it worse?
4. Why is publishing to Kafka inside `@Transactional` a bug? What replaces it?
5. Name three reasons NOT to split a monolith — and one good reason to.

---

## 6. Cheat sheet

| Task | Reach for |
| --- | --- |
| Container sizing | `-XX:MaxRAMPercentage=75` + `MaxRAMContainerSupport` |
| Container health | `HEALTHCHECK` + `/actuator/health/{liveness,readiness}` |
| Fast image, safe build | Multistage Dockerfile + `dependency:go-offline` |
| CI protection | `./mvnw verify` + JaCoCo gate + image smoke test |
| Find the slow thing | `/actuator/metrics/http.server.requests`, SQL log, JFR |
| Pool exhaustion | HikariCP `maximumPoolSize` + `connection-timeout` |
| Slow dependency | Timeout → circuit breaker → bulkhead → fallback |
| Durable async work | Kafka/Rabbit + outbox pattern, idempotent consumers |
| Enforce module boundaries | Spring Modulith / ArchUnit tests |
| Safe schema change | Expand → migrate → contract, across separate deploys |
