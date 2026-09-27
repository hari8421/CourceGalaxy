---
title: "Week 2 — Spring Boot Fundamentals"
track: "spring"
week: 2
order: 2
type: "module"
hours: 15
summary: "Auto-configuration, IoC and dependency injection, bean stereotypes, configuration properties, profiles, and a layered project structure."
tags: ["spring-boot", "ioc", "di", "beans", "configuration", "profiles"]
---

# Week 2 — Spring Boot Fundamentals

**Goal by Friday:** a layered `library-service` with constructor injection everywhere, typed
configuration properties, and profile-specific behaviour — and the ability to explain *why*
Spring is doing whatever it is doing.

---

## 1. Concepts (2 h)

### 1.1 The one idea that makes Spring make sense

> **Inversion of Control.** Your classes do not create their dependencies. The container
> (`ApplicationContext`) creates your classes *and* their dependencies, and hands them over.

```java
// Without Spring — you know exactly what happens
var service = new BookService(new BookRepository(jdbc), new PriceService(config));

// With Spring — you declare, the container resolves
@Service
public class BookService {
    private final BookRepository repository;      // no @Autowired needed on a single constructor
    private final PriceService prices;

    public BookService(BookRepository repository, PriceService prices) {
        this.repository = repository;
        this.prices = prices;
    }
}
```

Since Spring 4.3, a class with a **single constructor** needs no `@Autowired`. Use it
everywhere; it is the cleanest annotation-free wiring there is.

### 1.2 What "auto-configuration" actually does

At startup, `spring-boot-starter-web` puts `WebMvcAutoConfiguration` on the classpath.
Spring Boot sees that class, applies it *because* your classpath has `spring-webmvc` + a
servlet container, and registers an embedded Tomcat, a `DispatcherServlet`, Jackson, and
default MVC converters. **You never wrote a `web.xml` or configured a servlet container.**

You can see the whole decision tree at any time:

```bash
./mvnw spring-boot:run -Dspring-boot.run.arguments=--debug
# Look for: "Negative matches" and "Positive matches" under CONDITIONS EVALUATION REPORT
```

**Reading that report is a genuinely useful skill** — it explains why your bean is or is not
being created, which is the #1 source of Spring confusion.

### 1.3 Bean stereotypes and what each is for

| Annotation | Use for | Note |
| --- | --- | --- |
| `@Component` | Any managed class | Generic stereotype. |
| `@Service` | Business logic | Semantics only, but it reads better. |
| `@Repository` | Data access | Adds exception translation. |
| `@Controller` | MVC controllers (HTML/JSON) | |
| `@RestController` | JSON API controllers | `@Controller` + `@ResponseBody` |
| `@Configuration` + `@Bean` | Third-party classes, conditional wiring | You cannot annotate someone else's class. |

**Component scanning:** Spring scans the package of the `@SpringBootApplication` class and
all sub-packages. Put your main class at the **root** of your app or components will not be
found — a rite-of-passage error.

### 1.4 The bean lifecycle (know the five scopes)

`singleton` (default) → one instance per context. `prototype` → new per injection point.
`request`, `session`, `application` — web only.

```java
@Service
public class ReportCache {
    @PreDestroy
    void shutdown() { pool.shutdown(); }      // the lifecycle callback you will actually use
}
```

**Rule:** default to singleton. Prototype beans with injected singletons create leaky
dependencies; most "we need prototype" situations are solved by a method call instead.

### 1.5 Beans vs component scanning — the professional pattern

```java
@Configuration
@EnableConfigurationProperties(LibraryProperties.class)
public class LibraryConfig {

    @Bean
    DataSource dataSource(LibraryProperties props) {          // fine for a library class
        var ds = new HikariDataSource();
        ds.setJdbcUrl(props.datasource().url());
        ds.setMaximumPoolSize(props.datasource().poolSize());
        return ds;
    }

    @Bean
    Clock clock() {                                          // makes time testable everywhere
        return Clock.systemUTC();
    }
}
```

You rarely write `@Bean` for your own classes (use `@Service`), but constantly for
third-party ones: `RestClient`, `ObjectMapper` customisations, `CacheManager`,
`PasswordEncoder`, `Clock`, clients to other services.

### 1.6 Typed configuration — never read raw properties

```java
@ConfigurationProperties(prefix = "library")
public record LibraryProperties(
    String name,
    int loanPeriodDays,
    Datasource datasource,
    Cache cache
) {
    public record Datasource(String url, String username, int poolSize) {}
    public record Cache(long ttlSeconds, int maxEntries) {}
}
```

```yaml
library:
  name: "City Library"
  loan-period-days: 21
  datasource:
    url: jdbc:postgresql://localhost:5432/library
    username: library
    pool-size: 10
  cache:
    ttl-seconds: 300
    max-entries: 1000
```

Usage: `private final LibraryProperties props;` — **type-safe, refactorable, testable**. It
also gives you a validated, self-documenting list of every knob your app has. Toggle
validation in `application.yml`:

```yaml
spring:
  configuration-properties-validate-on-startup: true   # fail fast on a typo'd key
```

### 1.7 Profiles: dev, test, prod without branching in code

```yaml
# application.yml — shared defaults
spring:
  datasource: { url: jdbc:postgresql://localhost:5432/library }

---
# application-dev.yml
logging:
  level:
    com.example: DEBUG
library:
  cache:
    ttl-seconds: 0        # no caching while developing

---
# application-prod.yml
library:
  cache:
    ttl-seconds: 600
```

Activate with `SPRING_PROFILES_ACTIVE=prod`, or `--spring.profiles.active=prod`.

**Rule: never `if (dev)` in production code.** Branch via beans, profile-specific
`@Configuration` classes, or properties.

### 1.8 The project structure that scales

```
com.example.library
├── LibraryApplication.java          # @SpringBootApplication at the ROOT package
├── config/                          # @Configuration, WebClient/RestClient beans
├── web/                             # controllers — the HTTP edge ONLY
│   ├── BookController
│   └── dto/                         # request/response records (never return entities)
├── domain/                          # entities, value objects, domain exceptions
│   ├── Book.java                    // JPA entity
│   └── exception/
├── service/                         # business logic, transactions
├── persistence/                     # repositories, JPA mappings
└── client/                          # outbound HTTP clients
```

**Dependency rule:** `web → service → persistence`. Nothing points backwards. If a
controller talks to a repository directly, your business rules have leaked into the
transport layer and cannot be reused.

---

## 2. Lab — `library-service` (the week's main build)

**Spec:** an in-memory-ish library domain with real structure, no persistence yet (that is
Week 3).

```
domain/Book.java          record with validation
domain/LoanPolicy.java    business rules as a pure class
web/LoanController.java   GET /api/books/{id}/availability
config/LibraryProperties.java
config/LibraryConfig.java
service/LibraryService.java
exception/BookNotFoundException.java
```

### 2.1 A service that is trivially testable

```java
@Service
public class LibraryService {

    private final BookRepository books;
    private final LoanPolicy policy;
    private final LibraryProperties properties;
    private final Clock clock;

    public LibraryService(BookRepository books, LoanPolicy policy,
                          LibraryProperties properties, Clock clock) {
        this.books = books;
        this.policy = policy;
        this.properties = properties;
        this.clock = clock;
    }

    public BookView getBook(long id) {
        return books.findById(id)
            .map(BookView::from)
            .orElseThrow(() -> new BookNotFoundException(id));
    }

    public LoanResult loan(long bookId, long memberId) {
        var book = getBookOrThrow(bookId);
        policy.assertLoanable(book, clock.instant());     // rules live in ONE place
        return new LoanResult(book.isbn(), properties.loanPeriodDays(),
                              clock.instant().plus(properties.loanPeriodDays()));
    }
}
```

Every dependency is injected, so the test is `new LibraryService(fakeBooks, new LoanPolicy(),
    new LibraryProperties(...), fixedClock)`. No Spring, no container, no context.

### 2.2 The `@SpringBootTest` you will use when you genuinely need the context

```java
@SpringBootTest
@ActiveProfiles("test")
class LibraryServiceIntegrationTest {

    @Autowired LibraryService service;          // @MockBean a repo you do not want to touch

    @Test void loanReturnsDueDate() {
        var result = service.loan(1L, 42L);
        assertThat(result.dueOn()).isEqualTo(Instant.parse("2026-01-22T00:00:00Z"));
    }
}
```

**Know both modes:** plain `new` for unit tests (fast, precise), `@SpringBootTest` for
wiring tests (slow, catches bean mistakes). Using the second for everything is the most
common beginner mistake — 40 seconds of context startup per test class adds up.

### 2.3 Fail-fast configuration

```java
@Service
public class LoanPolicy {
    private static final Set<DayOfWeek> CLOSED = Set.of(DayOfWeek.SUNDAY);
    private final int maxActiveLoans;

    public LoanPolicy(@Value("${library.max-active-loans:5}") int maxActiveLoans) {
        this.maxActiveLoans = maxActiveLoans;
    }

    public void assertLoanable(Book book, Instant now) {
        if (book.activeLoans() >= maxActiveLoans)
            throw new LoanLimitExceededException(book.isbn(), maxActiveLoans);
        if (CLOSED.contains(book.nextOpenDay()))                  // domain rules, not null checks
            throw new LibraryClosedException(book.isbn());
    }
}
```

Domain logic in plain Java, with the config value injected. No `ApplicationContext` in
sight, and every branch is unit-testable in milliseconds.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Add field `@Autowired` injection; run tests; break it on purpose | Why constructor injection is mandatory for tests |
| 2 | Start with a missing bean; read the full stack trace | Reading Spring errors is a core skill |
| 3 | Run with `--debug`, find your component in the conditions report | How auto-config reasons |
| 4 | Bind a config class; typo a property name; enable validation on startup | Fail fast over silent defaults |
| 5 | Write two profiles with different `Clock` beans | Profile-based bean swapping |
| 6 | Add a `RestClient` `@Bean` pointing at a fake API | Configuring third-party clients |
| 7 | Move the main class down a package; watch components vanish | Why the main class must be at the root |

---

## 4. Deliverable — `library-service`

- [ ] Correct package structure, main class at the root
- [ ] Constructor injection everywhere; no field injection anywhere
- [ ] `LibraryProperties` with `validate-on-startup`
- [ ] `dev` and `test` profiles with real differences
- [ ] `Clock` bean defined in config and injected into services
- [ ] ≥ 12 unit tests, all without a Spring context
- [ ] 1 `@SpringBootTest` proving the context loads
- [ ] README explaining the bean graph in 10 lines of ASCII

**Self-check:** can you point at any class and say which bean it depends on and why? If yes,
you understand Spring better than most people who "use Spring".

---

## 5. Cheat sheet

| Symptom | Cause | Fix |
| --- | --- | --- |
| `NoSuchBeanDefinitionException` | Component outside scan path | Move it under the main class's package |
| Bean not injected | No bean of that type exists | Add the starter / define a `@Bean` |
| `BeanCreationException` | A dependency failed | Read the **root cause** at the bottom |
| Wrong value from properties | Typo in the key | `validate-on-startup: true` |
| Same code behaves differently per env | Hardcoded values | Profiles + `@ConfigurationProperties` |
| Tests are slow | Everything is `@SpringBootTest` | Plain `new` for unit tests |
| Circular dependency | Two beans need each other | Extract a third bean; never use `@Lazy` as a fix |
