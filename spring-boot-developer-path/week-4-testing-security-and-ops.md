---
title: "Week 4 — Testing, Security & Operations"
track: "spring"
week: 4
order: 4
type: "module"
hours: 18
summary: "The test pyramid with Testcontainers, Spring Security with JWT and roles, actuator and metrics, caching, async, scheduling, and structured logging."
tags: ["testing", "security", "jwt", "oauth2", "actuator", "caching", "async", "logging"]
---

# Week 4 — Testing, Security & Operations

**Goal by Friday:** every endpoint authenticated and role-checked, an integration suite on
real PostgreSQL, health/metrics endpoints exposed, and a test pyramid that runs in under two
minutes.

---

## 1. Concepts (3 h)

### 1.1 The test pyramid, applied to Spring

| Layer | What it tests | Speed | Typical share | How |
| --- | --- | --- | --- | --- |
| **Unit** | One class, no Spring | ms | 60–70 % | `new MyService(fakeRepo)` |
| **Slice** | One framework slice | 0.3–2 s | 20–30 % | `@WebMvcTest`, `@DataJpaTest` |
| **Integration** | Real DB + real context | 3–20 s | 5–10 % | `@SpringBootTest` + Testcontainers |
| **E2E** | Whole system | minutes | < 1 % | Playwright/Cypress against a running stack |

**The two mistakes:** (1) writing everything as `@SpringBootTest` — slow, and a failure tells
you "something is broken" rather than what; (2) writing no integration tests at all — then
your JPQL is unverified.

### 1.2 Slices: fast, focused, and underused

```java
@WebMvcTest(BookController.class)     // loads MVC, not your service
class BookControllerTest {

    @Autowired MockMvc mvc;
    @MockitoBean BookService service;   // Boot 3.4+ replaces the deprecated @MockBean

    @Test void returns404ProblemDetail() throws Exception {
        when(service.get(42L)).thenThrow(new BookNotFoundException(42L));

        mvc.perform(get("/api/v1/books/42"))
           .andExpect(status().isNotFound())
           .andExpect(jsonPath("$.title").value("Book not found"))
           .andExpect(jsonPath("$.bookId").value(42));
    }
}
```

```java
@DataJpaTest                                   // JPA + real DB, nothing else
@Testcontainers
class BookRepositoryTest {
    @Container @ServiceConnection
    static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:16-alpine");
    @Autowired BookRepository repo;

    @Test void searchFiltersByTitleIgnoringCase() {
        repo.saveAll(List.of(book("Dune"), book("Neuromancer")));
        assertThat(repo.search("DUN", null, PageRequest.of(0, 10)))
            .hasSize(1);
    }
}
```

`@WebMvcTest` + MockMvc verifies **serialisation, validation, status codes, and the error
contract** without touching the database. That is exactly the layer you want fast.

### 1.3 Spring Security: the mental model

Every request passes through a **filter chain**. The default is:

```
HTTP Basic (formLogin, csrf)  →  all requests authenticated  →  all requests denied
```

Your job is to describe access declaratively:

```java
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(AbstractHttpConfigurer::disable)          // stateless JWT API
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**", "/actuator/health").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/books/**").hasAnyRole("USER", "LIBRARIAN")
                .requestMatchers(HttpMethod.POST, "/api/v1/books/**").hasRole("LIBRARIAN")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/**").hasRole("LIBRARIAN")
                .anyRequest().authenticated())
            .oauth2ResourceServer(o -> o.jwt(withDefaults()))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .build();
    }
}
```

**Rules:**
- `csrf.disable()` is correct **only** for a stateless token API. If you use cookies for
  auth, keep CSRF on.
- Deny by default: end with `.anyRequest().authenticated()`, never `.permitAll()` at the end.
- Enable method security for finer checks: `@PreAuthorize("hasRole('LIBRARIAN')")` on a
  service method. Coarse rules in the filter chain, fine rules at the boundary.

### 1.4 JWT vs sessions vs opaque tokens

| | Session | JWT | Opaque token |
| --- | --- | --- | --- |
| State | Server | Client | Server (Redis) |
| Revocation | Easy | **Hard** (until expiry) | Easy |
| Horizontal scaling | Needs session store | Trivial | Needs shared store |
| Size | Cookie | ~1–2 KB in the header | Small |

Practical guidance: use **short-lived access tokens (5–15 min) + refresh tokens** for
browser apps, and keep a **deny-list or version check** so you can kill a leaked token
early. A pure "JWTs cannot be revoked" system is a vulnerability waiting for an incident.

### 1.5 Security you must not forget (beyond Spring)

1. **Mass assignment** — never bind a request body straight onto an entity. Use a request
   record with only the fields a client may set. This is how privilege escalation happens.
2. **SQL injection** — JPA parameters are safe; string-concatenated JPQL/SQL is not. Use
   `:param` binding or Specifications for dynamic filters.
3. **IDOR** — `GET /api/v1/loans/{id}` must check the loan belongs to the caller. Object
   authorisation is a per-endpoint check, not something the framework does for you.
4. **Secrets** — never in `application.yml` in git. Use env vars / Vault / Spring Cloud
   Config, and rotate.
5. **Rate limiting** and lockout on auth endpoints.
6. **Actuator** — exposing `/actuator/env` or `/actuator/heapdump` publicly leaks secrets
   and memory. Restrict by port, network, or auth.

### 1.6 Actuator and metrics — observability from day one

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus    # NOT env,heapdump,threaddump in prod
  endpoint:
    health:
      show-details: when-authorized
      probes:
        enabled: true                              # /actuator/health/liveness, /readiness
  metrics:
    tags:
      application: library-service
```

**What to watch, and what each tells you:**

| Endpoint | Use it to answer |
| --- | --- |
| `/actuator/health` | Is it up? Is the DB reachable? |
| `/actuator/metrics/http.server.requests` | p95 latency, error rate, which endpoint is slow |
| `/actuator/metrics/jvm.memory.used` | Leaking? |
| `/actuator/metrics/hikaricp.connections.pending` | Pool exhaustion — the classic outage |
| `/actuator/httpexchanges` | Debug one request end to end (dev only) |

```java
// Custom business metric — the ones that tell you the product is broken
@Component
class LoanMetrics {
    private final MeterRegistry registry;
    private final Counter loans = Counter.builder("library.loans").register(registry).build();

    LoanMetrics(MeterRegistry registry) { this.registry = registry; }
    void recordLoan(long minutesToDue) {
        loans.increment();
        registry.timer("library.loan.duration").record(minutesToDue, TimeUnit.MINUTES);
    }
}
```

**Do this on day one.** Metrics you add during an incident are fiction.

### 1.7 Caching

```java
@Service
@RequiredArgsConstructor
public class BookQueryService {

    @Cacheable(value = "books", key = "#id")
    public Book get(long id) { ... }

    @CacheEvict(value = "books", key = "#id")
    @Transactional
    public void update(long id, UpdateBookRequest req) { ... }

    @CacheEvict(value = "books", allEntries = true)          // list endpoints share the key space
    @Transactional
    public Book create(CreateBookRequest req) { ... }
}
```

Rules: cache **reads**, evict on **writes**; keep TTL finite as a safety net; never cache
per-user data under a global key; and beware a self-invocation (`this.get()`) silently
bypassing the proxy.

### 1.8 Async, scheduling, and events

```java
@Service
@RequiredArgsConstructor
public class LoanNotifier {

    @Async("notificationsExecutor")                     // named executor, bounded queue
    public void notifyMember(long memberId) { ... }

    @EventListener
    public void on(LoanCreatedEvent event) { ... }        // sync, in the same tx by default
}

@Configuration
@EnableAsync
class AsyncConfig {
    @Bean("notificationsExecutor")
    ThreadPoolTaskExecutor notificationsExecutor() {
        var ex = new ThreadPoolTaskExecutor();
        ex.setCorePoolSize(4); ex.setMaxPoolSize(8);
        ex.setQueueCapacity(500);
        ex.setThreadNamePrefix("notify-");
        ex.initialize();
        return ex;
    }
}
```

**Non-final words that matter here:** a `@Async` method **must** be called from another
bean (proxy), its return value is `Future`/`CompletableFuture`, and an unbounded executor is
a memory leak with extra steps. For anything that must survive a restart, use a queue
(Section 2 of Week 5) — not `@Async`.

### 1.9 Structured logging

```java
log.info("loan_created bookId={} memberId={} dueOn={} durationMs={}",
         bookId, memberId, dueOn, System.currentTimeMillis() - start);
```

Message templates with `{}` placeholders — not string concatenation, so the level check is
free and the fields stay parseable. Never log passwords, tokens, or full card numbers. MDC
for correlation IDs so a request can be followed across threads:

```java
MDC.put("requestId", requestId);        // set in a filter, cleared in finally
```

---

## 2. Lab — secure and instrument `library-service` (the week's main build)

### 2.1 Auth: issue and verify a token

```java
@Service
@RequiredArgsConstructor
public class TokenService {
    private final SecretKey key;
    private final Duration ttl = Duration.ofMinutes(15);

    public String issue(User user) {
        return Jwts.builder()
            .subject(user.getEmail())
            .claim("roles", user.getRoles().stream().map(Role::name).toList())
            .issuedAt(new Date())
            .expiration(Date.from(Instant.now().plus(ttl)))
            .signWith(key, Jwts.SIG.HS256)
            .compact();
    }
}
```

> For production, prefer **OAuth2 Resource Server** (validate IdP-issued JWTs) over minting
> your own. The resource-server config above is one line; hand-rolled HS256 signing is
> something you should not ship.

### 2.2 Method-level authorisation (the second line of defence)

```java
@Service
@Transactional(readOnly = true)
public class LoanService {

    @PreAuthorize("hasRole('LIBRARIAN') or #memberId == authentication.name")
    public List<Loan> loansFor(long memberId) { ... }        // object-level check
}
```

### 2.3 The full integration test suite

```java
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@ActiveProfiles("test")
class BookApiSecurityIT {

    @Container @ServiceConnection
    static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired MockMvc mvc;
    @Autowired JwtEncoder encoder;

    private String tokenFor(String role) {
        return encoder.encode(JwtEncoderParameters.from(
            JwsHeader.with(SignatureAlgorithm.RS256).build(),
            JwtClaimsSet.builder().subject("tester").claim("roles", List.of(role))
                     .issuedAt(now()).expiresAt(now().plusSeconds(600)).build())).getTokenValue();
    }

    @Test void anonymousCannotList() throws Exception {
        mvc.perform(get("/api/v1/books")).andExpect(status().isUnauthorized());
    }

    @Test void userCanReadButNotCreate() throws Exception {
        mvc.perform(get("/api/v1/books").header("Authorization", "Bearer " + tokenFor("USER")))
           .andExpect(status().isOk());
        mvc.perform(post("/api/v1/books").header("Authorization", "Bearer " + tokenFor("USER"))
                   .contentType(APPLICATION_JSON).content("""
                     {"title":"Dune","isbn":"9780441013593","publishedYear":1965,"copies":1}"""))
           .andExpect(status().isForbidden());
    }

    @Test void librarianCanCreate() throws Exception { /* expect 201 */ }
}
```

That is the test a security reviewer will look for: **401 without a token, 403 with the
wrong role, 2xx with the right one.** All three, or your authorisation has a hole.

### 2.4 Ship the observability

```bash
curl localhost:8080/actuator/health
curl localhost:8080/actuator/metrics/hikaricp.connections.pending
```

Add the business metrics, structured logging with a request id, and a `GET /api/v1/me` that
returns the current principal (useful for debugging, harmless if it returns only your own).

---

## 3. Practical drills (3 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Remove a `hasRole` line; replay the 403 test | What you just allowed |
| 2 | Add a field to the request DTO only; try to set `role` from JSON | Mass assignment, concretely |
| 3 | Expose `/actuator/env` publicly; look at what leaks | Why actuator exposure is a config decision |
| 4 | `self.method()` calling an `@Async` method; observe it runs synchronously | Proxy-based magic has rules |
| 5 | Fill the executor's queue in a load test | Bounded queues prevent OOM |
| 6 | Compare `@WebMvcTest` vs `@SpringBootTest` wall-clock on the same logic | The pyramid pays for itself |
| 7 | Add a slow endpoint; check `http.server.requests` p95 | You can see latency now |

---

## 4. Deliverable — `library-service` v3

- [ ] JWT (or OAuth2 resource server) auth; stateless, CSRF handled correctly
- [ ] Route rules in `SecurityFilterChain` + method-level `@PreAuthorize`
- [ ] Object-level check: a user cannot read another member's loans (with a test)
- [ ] ≥ 3 tests per endpoint: 401 / 403 / 2xx
- [ ] Full pyramid: unit + `@WebMvcTest` + `@DataJpaTest` + Testcontainers IT
- [ ] Actuator with health, metrics, and probes; a Prometheus endpoint
- [ ] ≥ 3 custom business metrics and structured logging with a request id
- [ ] `@Cacheable` reads with eviction on writes
- [ ] `README.md`: the auth flow, the endpoint/role matrix, and how to run the tests

---

## 5. Self-check (security-focused)

1. If I forgot `.anyRequest().authenticated()`, which endpoints are exposed?
2. Where would a mass-assignment bug enter this code, and what DTO design prevents it?
3. A user's JWT is stolen. What in this design limits the damage, and for how long?
4. Show me a test that would fail if someone removed the IDOR check.
5. Which actuator endpoint must never be public, and why?

---

## 6. Cheat sheet

| Task | Reach for |
| --- | --- |
| Restrict a URL | `authorizeHttpRequests` in `SecurityFilterChain` |
| Restrict a method | `@PreAuthorize("hasRole('X')")` |
| Stateless API | `SessionCreationPolicy.STATELESS` + CSRF disabled |
| Validate external tokens | `oauth2ResourceServer(o -> o.jwt(...))` |
| Test one layer fast | `@WebMvcTest` / `@DataJpaTest` / plain unit |
| Test against real infra | Testcontainers + `@ServiceConnection` |
| See what is slow | `/actuator/metrics/http.server.requests` |
| Health for Kubernetes | `management.endpoint.health.probes.enabled` |
| Speed up a read | `@Cacheable` + `@CacheEvict` on writes |
| Follow a request | MDC request id in structured logs |
