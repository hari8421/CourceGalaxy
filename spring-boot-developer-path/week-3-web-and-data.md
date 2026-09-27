---
title: "Week 3 — REST APIs & Persistence"
track: "spring"
week: 3
order: 3
type: "module"
hours: 18
summary: "Spring MVC controllers, Bean Validation, RFC 7807 problem details, Spring Data JPA, Hibernate, transactions, Flyway migrations, and the N+1 problem."
tags: ["rest", "mvc", "validation", "jpa", "hibernate", "transactions", "flyway", "n-plus-one"]
---

# Week 3 — REST APIs & Persistence

**Goal by Friday:** a production-shaped CRUD + search API with pagination, filtering,
validation, consistent errors, a Flyway-managed schema, and no N+1 queries.

This is the largest week in the path, because it is most of the job.

---

## 1. Concepts (3 h)

### 1.1 What Spring MVC actually does per request

```
HTTP request
  → DispatcherServlet
    → HandlerMapping      finds the controller method        (@GetMapping, etc.)
    → HandlerAdapter      invokes it, converts args
    → HttpMessageConverter  JSON ⇄ Java objects              (Jackson)
    → @ResponseBody / @ResponseStatus  serialises the result
  ← JSON response
```

Everything you will customise sits at one of those five points. The two you will touch
most: **`@ControllerAdvice`** (cross-cutting error handling) and **`@RestControllerAdvice`**
+ `ProblemDetail` (consistent error bodies).

### 1.2 REST conventions worth enforcing

| Action | Method | Path | Success | Idempotent |
| --- | --- | --- | --- | --- |
| List | GET | `/api/books` | 200 | yes |
| Create | POST | `/api/books` | 201 + `Location` | no |
| Read | GET | `/api/books/{id}` | 200 / 404 | yes |
| Update | PUT | `/api/books/{id}` | 200 | yes |
| Partial update | PATCH | `/api/books/{id}` | 200 | no |
| Delete | DELETE | `/api/books/{id}` | 204 | yes |

- Plural nouns, never verbs in paths. Actions belong on sub-resources:
  `POST /api/loans/{id}/return`.
- **Never put secrets or PII in a path** — it lands in access logs and browser history.
- Version from day one if it is a public API: `/api/v1/...`.
- Return the created resource, not `200 OK` with an empty body.

### 1.3 Bean Validation — validate at the boundary, once

```java
public record CreateBookRequest(
    @NotBlank @Size(max = 200) String title,
    @NotBlank @Pattern(regexp = "^(97[89])?\\d{9}[\\dX]$") String isbn,
    @Min(1000) @Max(2027) Integer publishedYear,
    @PositiveOrZero Integer copies
) {}
```

```java
@RestController
@RequestMapping("/api/v1/books")
@RequiredArgsConstructor
public class BookController {

    private final BookService service;

    @PostMapping
    public ResponseEntity<BookResponse> create(@Valid @RequestBody CreateBookRequest req,
                                               UriComponentsBuilder uri) {
        var created = service.create(req);
        return ResponseEntity.created(uri.path("/api/v1/books/{id}")
                .buildAndExpand(created.id()).toUri()).body(created);
    }
}
```

**Three rules:**
1. `@Valid` on every `@RequestBody`. Without it, validation is silently skipped — a
   spectacularly common bug.
2. Validate in the **web layer**, then trust it in the service. Do not re-validate
   defensively; instead make the service's own method contract clear.
3. Custom constraints when a built-in is not enough:

```java
@Documented
@Constraint(validatedBy = ValidIsbn.Validator.class)
@Target({ FIELD, PARAMETER })
@interface ValidIsbn { String message() default "invalid ISBN"; ... }

class ValidIsbn {
    static class Validator implements ConstraintValidator<ValidIsbn, String> {
        @Override public boolean isValid(String value, ConstraintValidatorContext ctx) {
            if (value == null) return true;                       // @NotNull handles null
            return ISBN_PATTERN.matcher(value).matches();
        }
    }
}
```

### 1.4 Error handling with `ProblemDetail` (RFC 7807)

```java
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(BookNotFoundException.class)
    ProblemDetail notFound(BookNotFoundException e) {
        var pd = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
        pd.setTitle("Book not found");
        pd.setProperty("bookId", e.getId());          // machine-readable extras
        return pd;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail invalid(MethodArgumentNotValidException e) {
        var errors = e.getBindingResult().getFieldErrors().stream()
            .collect(Collectors.toMap(
                FieldError::getField, FieldError::getDefaultMessage, (a, b) -> a));
        var pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed");
        pd.setProperty("errors", errors);
        return pd;
    }
}
```

Response body — consistent, documented, easy for frontend devs to code against:

```json
{
  "type": "about:blank",
  "title": "Book not found",
  "status": 404,
  "detail": "No book 42",
  "bookId": 42
}
```

### 1.5 DTOs, and the rule that saves you from a security incident

**Never return a JPA entity from a controller.** Your entity will contain `passwordHash`,
internal flags, and lazy proxies, and it will leak whether you remember or not.

```java
@Entity
@Table(name = "books")
class Book {                       // package-private on purpose: not part of the API
    @Id Long id;
    String title;
    @Column(unique = true) String isbn;
    @Version long version;         // optimistic locking (see 1.7)
}

public record BookResponse(Long id, String title, String isbn, int availableCopies) {
    public static BookResponse from(Book b, int available) {
        return new BookResponse(b.id, b.title, b.isbn, available);
    }
}
```

Mapping rules: a **static factory** on the response record (`from`) beats a hand-written
mapper for simple cases; use **MapStruct** when mapping grows past a few classes.

### 1.6 Spring Data JPA: the 80% you never write

```java
public interface BookRepository extends JpaRepository<Book, Long> {

    Optional<Book> findByIsbn(String isbn);
    boolean existsByIsbn(String isbn);

    // Derived queries: Spring Data builds the SQL from the method name.
    List<Book> findByTitleContainingIgnoreCaseOrderByPublishedYearDesc(String title);

    // When the derived name gets silly, write the JPQL.
    @Query("""
        select b from Book b
        where (:title is null or lower(b.title) like lower(concat('%', :title, '%')))
          and (:yearFrom is null or b.publishedYear >= :yearFrom)
          and (:available = false or b.copies > b.activeLoans)
        """)
    Page<Book> search(@Param("title") String title,
                      @Param("yearFrom") Integer yearFrom,
                      @Param("available") boolean available,
                      Pageable pageable);
}
```

**Prefer derived queries until they become unreadable, then JPQL.** Never build SQL by
string concatenation — that is SQL injection, and JPQL parameters are safe.

**Pagination (mandatory for any list endpoint that can grow):**

```java
@GetMapping
Page<BookResponse> list(@RequestParam(defaultValue = "0") int page,
                        @RequestParam(defaultValue = "20") int size,
                        @RequestParam(defaultValue = "publishedYear,desc") String sort) {
    var pageable = PageRequest.of(page, Math.min(size, 100), Sort.by(sort.split(",")));
    return service.search(pageable).map(BookResponse::from);
}
```

Always cap `size`. A client asking for `size=1000000` is a self-inflicted outage.

### 1.7 Transactions, and the four mistakes everyone makes

```java
@Service
@RequiredArgsConstructor
public class LoanService {
    private final BookRepository books;
    private final LoanRepository loans;
    private final EntityManager em;

    @Transactional                                    // all-or-nothing
    public Loan loan(long bookId, long memberId) {
        var book = books.findById(bookId).orElseThrow(() -> new BookNotFoundException(bookId));
        book.addLoan();                               // mutate the managed entity
        em.flush();                                   // force the INSERT now: constraint errors surface HERE
        return loans.save(new Loan(book, LocalDate.now()));
    }
}
```

| Mistake | What actually happens | Fix |
| --- | --- | --- |
| `@Transactional` on a `private` method | Silently ignored (proxy-based AOP) | Public methods only |
| `self.method()` inside the class | The proxy is bypassed; no transaction | Extract to another bean |
| Catching the exception inside the transaction | The tx is already marked rollback-only | Let it propagate; handle it in the web layer |
| Using an entity from a closed session (LazyInitializationException) | Lazy loading outside a transaction | Fetch join, DTO projection, or `@EntityGraph` |

**`@Transactional(readOnly = true)`** for queries: it lets the JPA provider skip dirty
checking and route to a read replica. Use it everywhere you only read.

### 1.8 The N+1 problem — the single biggest performance bug in Spring apps

```java
// N+1: 1 query for members, then 1 per member for loans = 501 queries for 500 rows
List<Member> members = memberRepo.findAll();
members.forEach(m -> m.getLoans().size());
```

Fix, in order of preference:

```java
// (a) Fetch join — one query, JOIN FETCH
@Query("select distinct m from Member m left join fetch m.loans")
List<Member> findAllWithLoans();

// (b) Entity graph — no query edit
@EntityGraph(attributePaths = {"loans"})
List<Member> findAll();

// (c) DTO projection — least data, best for read models
@Query("select new com.example.api.MemberSummary(m.id, m.name, count(l.id)) from Member m left join m.loans l group by m.id")
List<MemberSummary> summaries();
```

**Verify, do not assume.** Turn on logging and count queries:

```yaml
logging:
  level:
    org.hibernate.SQL: DEBUG
    org.hibernate.orm.jdbc.bind: TRACE
```

Hibernate Statistics, or `datasource-proxy`, or simply reading the log after a page load.

### 1.9 Flyway: the schema is code

```sql
-- V1__create_books.sql
CREATE TABLE books (
    id            BIGSERIAL PRIMARY KEY,
    title         VARCHAR(200) NOT NULL,
    isbn          VARCHAR(13)  NOT NULL UNIQUE,
    published_year INT,
    copies        INT NOT NULL DEFAULT 0,
    version       BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_books_title ON books (lower(title));
```

```yaml
spring:
  flyway:
    enabled: true
    locations: classpath:db/migration
  jpa:
    hibernate:
      ddl-auto: validate      # NEVER create/update in production
    open-in-view: false       # see below
```

**Three rules:** `ddl-auto: create/update` is a dev-only convenience — in production always
`validate` and let Flyway own the schema. Never edit an applied migration; add a new one.
And set `open-in-view: false`, because the default `true` keeps a database connection open
for the entire web request (connection-pool exhaustion under load, and LazyInitialization
exceptions that "disappear" because of it).

### 1.10 Caching, briefly

```java
@EnableCaching
@Configuration
class CacheConfig {
    @Bean
    @Qualifier("books")
    CacheManager<String, Book> booksCache(LibraryProperties props) {
        var cache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(props.cache().ttlSeconds()))
            .maximumSize(props.cache().maxEntries())
            .build();
        return new ConcurrentMapCacheManager("books");   // simplified
    }
}
```

Cache at the **service** layer, key on inputs, invalidate on write. `@Cacheable` on a
controller is a smell. Never cache a user's permission decision without a short TTL.

---

## 2. Lab — the full CRUD + search API (the week's main build)

### 2.1 Layer-by-layer

```
POST   /api/v1/books                     create
GET    /api/v1/books/{id}                read
GET    /api/v1/books?title=&year=&page=  paged search
PUT    /api/v1/books/{id}                update
DELETE /api/v1/books/{id}                delete
POST   /api/v1/books/{id}/loans          loan a copy   (Week 4 secures this)
```

### 2.2 Service with transaction boundaries in the right place

```java
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)           // class-level: reads by default
public class BookService {

    private final BookRepository books;
    private final BookRepositoryCustom custom;

    public Page<Book> search(String title, Integer from, Pageable pageable) {
        return custom.search(title, from, pageable);
    }

    @Transactional                       // override for writes
    public Book create(CreateBookRequest req) {
        if (books.existsByIsbn(req.isbn()))
            throw new DuplicateIsbnException(req.isbn());
        return books.save(Book.of(req));
    }
}
```

### 2.3 Integration test with a real database (Testcontainers)

```java
@SpringBootTest
@Testcontainers
@ActiveProfiles("test")
class BookApiIT {

    @Container
    @ServiceConnection                       // Spring Boot wires the URL/credentials for you
    static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired MockMvc mvc;

    @Test void createThenFindByIsbn() throws Exception {
        mvc.perform(post("/api/v1/books").contentType(APPLICATION_JSON)
                   .content("""
                     {"title":"Dune","isbn":"9780441013593","publishedYear":1965,"copies":3}
                     """))
           .andExpect(status().isCreated())
           .andExpect(header().string("Location", containsString("/api/v1/books/")));

        mvc.perform(get("/api/v1/books").param("title", "dun"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.content[0].title").value("Dune"));
    }

    @Test void rejectsInvalidIsbn() throws Exception {
        mvc.perform(post("/api/v1/books").contentType(APPLICATION_JSON)
                   .content("""
                     {"title":"X","isbn":"not-an-isbn","publishedYear":2020,"copies":1}
                     """))
           .andExpect(status().isBadRequest())
           .andExpect(jsonPath("$.errors.isbn").exists());
    }
}
```

`@ServiceConnection` (Boot 3.1+) means no manual `@DynamicPropertySource` boilerplate. This
suite runs against **real PostgreSQL** — so your SQL, your constraints, and your Flyway
migrations are genuinely tested. H2 will lie to you; do not use it.

---

## 3. Practical drills (3 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Write a deliberately N+1 endpoint; count SQL statements in the log | Seeing the problem is memorising it |
| 2 | Fix it with `JOIN FETCH`, re-count | The fix is one annotation |
| 3 | Add `@Version` and two concurrent updates | Optimistic locking beats lost updates |
| 4 | Remove `@Valid`; watch validation silently disappear | The most common Spring bug |
| 5 | Set `open-in-view: false`; chase the LazyInitializationErrors | Why connections were leaking |
| 6 | Try to override a `final` field with reflection; observe | Immutability is load-bearing |
| 7 | Add a Flyway migration adding a column with a default | Real schema evolution |
| 8 | Return an entity from a controller; add a field; see the leak | Why DTOs are non-negotiable |

---

## 4. Deliverable — `library-service` v2

- [ ] Full CRUD + paged/filtered search, DTOs in and out
- [ ] `@Valid` everywhere; custom `@ValidIsbn` constraint
- [ ] `ProblemDetail` error handling for all exception types
- [ ] Flyway migrations; `ddl-auto: validate`; `open-in-view: false`
- [ ] `@Transactional` boundaries correct; `@Transactional(readOnly = true)` for queries
- [ ] No N+1 — verified by reading SQL logs, not by hope
- [ ] ≥ 10 Testcontainers integration tests against real PostgreSQL
- [ ] `README.md` with the endpoint table and a worked example request/response

**Self-check:** does `DELETE /api/v1/books/999999` return a clean `404` problem detail, and
does your test suite prove it? That single test is what a reviewer looks for first.

---

## 5. Cheat sheet

| Task | Reach for |
| --- | --- |
| Query by field | Derived method name |
| Complex search | `@Query` with JPQL + `Pageable` |
| Input validation | `@Valid` + constraint annotations on the DTO record |
| Consistent errors | `@RestControllerAdvice` + `ProblemDetail` |
| Never leak entities | Response records + static factory |
| Atomic multi-step writes | `@Transactional` on a public service method |
| Fix N+1 | `JOIN FETCH` / `@EntityGraph` / DTO projection |
| Schema changes | A new Flyway migration, never `ddl-auto` in prod |
| Concurrency | `@Version` (optimistic) or `SELECT ... FOR UPDATE` (pessimistic) |
| Test with a real DB | Testcontainers + `@ServiceConnection` |
