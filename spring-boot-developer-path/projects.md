---
title: "Projects & Capstone"
track: "spring"
week: 5
order: 6
type: "project"
hours: 14
summary: "Four portfolio projects and one production-grade capstone that demonstrate Java, Spring Boot, data, security, and operations."
tags: ["projects", "capstone", "portfolio", "interview"]
---

# Projects & Capstone

Documentation teaches you syntax. **These four builds are what get you hired.** Each one
exists to prove a specific capability that recruiters and interviewers check for.

---

## Project 1 — `task-tracker-cli` (Week 1)

**Proves:** you can write real Java without a framework.

- [ ] Record-based domain with validation in compact constructors
- [ ] `TaskRepository` interface + JSON implementation with atomic writes
- [ ] Stream-based filtering, sorting, and `groupingBy` statistics
- [ ] Custom exceptions with useful data (`TaskNotFoundException(id)`)
- [ ] ≥ 15 JUnit 5 tests: parameterised, negative, and edge cases
- [ ] Injected `Clock` so time-dependent tests are deterministic

**Stretch:** a `--format=json` output mode so it pipes into `jq`.

---

## Project 2 — `library-service` (Week 2–3)

**Proves:** you can build a REST API with a real database.

- [ ] CRUD + paged/filtered search on PostgreSQL
- [ ] DTOs in/out; entities never leave the web layer
- [ ] Bean Validation + a custom constraint (`@ValidIsbn`)
- [ ] `ProblemDetail` error contract for every failure mode
- [ ] Flyway migrations; `ddl-auto: validate`; `open-in-view: false`
- [ ] Correct `@Transactional` boundaries; N+1 verified fixed
- [ ] ≥ 10 Testcontainers integration tests
- [ ] OpenAPI/Swagger via `springdoc-openapi` + a documented `README`

**Stretch:** add a `GET /api/v1/books` export to CSV with a streaming response so large
exports do not buffer in memory.

---

## Project 3 — `secure-notes-api` (Week 4)

**Proves:** you can secure a service, and you can prove it.

- [ ] OAuth2 Resource Server (preferred) **or** JWT with short expiry + refresh
- [ ] Route rules in `SecurityFilterChain`; method-level `@PreAuthorize`
- [ ] Object-level authorisation: a user cannot read another user's note (with a test)
- [ ] The 401/403/2xx test for every endpoint
- [ ] Actuator health/metrics/prometheus; business metrics
- [ ] `@Cacheable` reads with eviction on writes
- [ ] Audit log of access with a correlation id

**Stretch:** write a short "security model" section in the README: trust boundaries,
threats, mitigations. Interviewers read this and skip five questions.

---

## Project 4 — `bookstore-microservices` (Week 5)

**Proves:** you understand systems, not just frameworks.

- [ ] `catalog` + `orders` (+ optionally `lending`), with a **real** reason for each boundary
- [ ] `RestClient`/`WebClient` between services, with timeouts, retry, and a circuit breaker
- [ ] Outbox pattern + Kafka for `order.created` events; idempotent consumers
- [ ] Contract tests so service changes do not silently break each other
- [ ] Docker Compose for the whole stack
- [ ] Per-service Dockerfile, health checks, and metrics
- [ ] Distributed tracing (Micrometer + Zipkin) across a two-service call

**Stretch:** implement sagas/choreography for the order → inventory saga with a compensating
action, and write about why you chose choreography over orchestration.

---

## Capstone — `taskflow-api` (end of path)

**A production-grade service that a team could actually deploy.**

**Domain:** task/project management — projects, tasks, assignees, comments, activity feed.

**Required scope:**

- [ ] Full REST API, versioned, documented with OpenAPI
- [ ] PostgreSQL + Flyway, correct indexes, no N+1
- [ ] JWT auth with roles (`USER`, `MANAGER`, `ADMIN`) and object-level authorisation
- [ ] Layered architecture: `web` / `service` / `persistence` / `domain`
- [ ] Test pyramid: unit + slice + Testcontainers integration, CI-gated
- [ ] Docker image + CI pipeline that smoke-tests the running container
- [ ] Actuator, Prometheus metrics, structured logging with request ids
- [ ] `@Cacheable` on hot reads, `@Async` events for notifications
- [ ] OpenAPI docs, `README.md` with architecture diagram + curl examples

**Definition of done:**

- [ ] `./mvnw verify` green; CI green; container starts and reports healthy
- [ ] `GET /actuator/metrics/http.server.requests` shows your endpoints
- [ ] Every endpoint has 401/403 tests where relevant
- [ ] A `README.md` a new engineer could clone-and-run in five minutes
- [ ] You can explain every architectural decision — **including the ones you reverted**

---

## Portfolio polish (1 h, do not skip)

For each project:

1. **One-line hook** in the README, with a number:
   *"Task API with JWT + roles. 94% coverage, 1.2k requests/s, 8 ms p95."*
2. **Architecture in ASCII** — 10 lines beats an out-of-date diagram.
3. **Screenshots or a short GIF** of Swagger UI or the app working.
4. **"What I'd do next"** — a real roadmap item demonstrates judgement.
5. **Tests visible in the README** — a coverage badge and the command to run them.
6. **Clean commit history** — 20 focused commits tell a story; one giant commit does not.

---

## The interview script you are building toward

Prepare these; they cover most Spring Boot loops:

1. *"Walk me through a Spring Boot service you built. How is it structured, and why?"*
2. *"How do you decide where a transaction boundary goes?"* → aggregate/service method,
   public, external calls outside the tx.
3. *"How do you find and fix an N+1?"* → SQL logging, `JOIN FETCH`, DTO projection.
4. *"How do you test a Spring service?"* → the pyramid; slices for speed, Testcontainers for
   truth.
5. *"How would you secure this API?"* → stateless JWT, route rules + method security,
   object-level checks, 401/403/2xx tests, actuator locked down.
6. *"How do you know a database call is the bottleneck?"* → metrics, pool stats, EXPLAIN
   ANALYZE, a load test.
7. *"When would you break this monolith apart?"* → domain boundaries, scaling, team
   ownership — and the costs.

Rehearse until each answer names a file, a class, and a number from your own project.

---

## After the path: where to go next

| Direction | What to learn | Why it pays |
| --- | --- | --- |
| **Senior backend** | Kotlin, virtual threads, structured concurrency, deeper JVM | Modern Java concurrency is a genuine differentiator |
| **Cloud-native** | Kubernetes operators, Helm, service meshes | Every large company runs on it |
| **Data-heavy** | jOOQ, query tuning, CDC, Kafka Streams | The most defensible Spring niche |
| **Enterprise integration** | Spring Batch, Apache Camel, Spring Integration | Where large Java estates actually live |
| **Microservices** | Resilience4j, contract testing, service meshes | Already covered in Week 5 — go deeper |
| **Frontend-adjacent** | HTMX + Thymeleaf, or a React SPA behind a Spring API | Small teams ship both halves |
