---
title: "Week 1 — Modern Java Fundamentals"
track: "spring"
week: 1
order: 1
type: "module"
hours: 16
summary: "The Java you need before Spring: OOP, generics, collections, streams, exceptions, records, Optional, Maven, and JUnit."
tags: ["java", "oop", "collections", "streams", "exceptions", "junit", "maven"]
---

# Week 1 — Modern Java Fundamentals

**Goal by Friday:** a dependency-free CLI task tracker with a JSON store, stream-based
filtering, custom exceptions, and a passing JUnit suite. No Spring yet.

---

## 1. Concepts (2 h)

### 1.1 The type system you will actually use

Java is statically typed, strongly typed, and nominal (a `Dog` is a `Dog` because of its
declaration, not its shape).

```java
public record Point(int x, int y) {}                 // immutable value object, auto equals/hashCode
public sealed interface Shape permits Circle, Square {} // closed hierarchy -> exhaustive switch
public enum Status { NEW, ACTIVE, DONE }

public sealed interface Shape permits Circle, Square {
    double area();
}
record Circle(double r) implements Shape { public double area() { return Math.PI * r * r; } }
record Square(double s) implements Shape { public double area() { return s * s; } }

String describe(Shape shape) {
    return switch (shape) {                        // exhaustive, compiler-checked
        case Circle c -> "circle r=" + c.r();
        case Square s -> "square s=" + s.s();
    };                                              // no default needed — and that's the point
}
```

**Use `sealed` + `switch` instead of visitor patterns and instanceof chains.** It is the
modern answer to "closed set of subtypes".

### 1.2 Classes, immutability, and why records everywhere

```java
// 1. Field injection — do not do this
class OrderService { @Autowired private PaymentGateway gateway; }

// 2. Constructor injection — do this
@Service
class OrderService {
    private final PaymentGateway gateway;
    OrderService(PaymentGateway gateway) { this.gateway = gateway; }
}
```

Benefits, all of which you will be asked about: the dependency is `final`, the object is
impossible to construct in a half-initialised state, and a unit test is
`new OrderService(fakeGateway)`. This is the single most important habit in this path.

**Rule:** make everything `private final`; expose behaviour, not fields. Use Lombok
`@Getter`/`@RequiredArgsConstructor` for boilerplate, but write the constructor yourself if
the logic is non-trivial.

### 1.3 Generics and wildcards — the 20% that matters

```java
List<String> names = new ArrayList<>();
names.add("a");                       // fine

List<?> any = names;                  // read-only view of unknown type
Map<String, List<Integer>> index = new HashMap<>();
index.computeIfAbsent("a", k -> new ArrayList<>()).add(1);   // the idiom you will use daily
```

You need to *recognise* PECS ("Producer Extends, Consumer Super"). You do not need to
design generic frameworks in week one.

### 1.4 Collections: pick correctly

| Need | Use | Notes |
| --- | --- | --- |
| Key→value | `HashMap` | Default. Not thread-safe, not ordered. |
| Insertion order | `LinkedHashMap` | For deterministic output and LRU caches. |
| Sorted / range queries | `TreeMap` | O(log n), navigable. |
| Unique, ordered | `TreeSet` | |
| Queue / stack | `ArrayDeque` | Faster than `Stack`, which is legacy. |
| Concurrent | `ConcurrentHashMap` | The real answer to "my map broke under load". |

**`List.of(...)` / `Map.of(...)` are immutable.** Perfect for constants; a runtime error if
someone tries to mutate them.

### 1.5 Streams: readable or dead

```java
List<Order> orders = repo.findAll();

Map<Status, BigDecimal> totals = orders.stream()
    .filter(o -> o.status() == Status.ACTIVE)
    .collect(Collectors.groupingBy(Order::status,
        Collectors.reducing(BigDecimal.ZERO, Order::total, BigDecimal::add)));
```

**Rule:** a stream longer than ~5 lines should be a loop. Streams are for transformation
pipelines, not for hiding control flow. `map`, `filter`, `flatMap`, `collect`, `anyMatch`,
`groupingBy` cover 95 % of real use.

### 1.6 Exceptions: the rules that keep a service alive

```java
// Checked exceptions: use for recoverable conditions the caller must handle.
public class InsufficientFundsException extends Exception {
    private final BigDecimal shortfall;
    public InsufficientFundsException(BigDecimal shortfall) {
        super("Short by " + shortfall);
        this.shortfall = shortfall;
    }
    public BigDecimal shortfall() { return shortfall; }
}

// Runtime exceptions: programming errors / unrecoverable. Never use for validation
// in a web layer — use Bean Validation annotations there instead.
public class OrderNotFoundException extends RuntimeException {
    public OrderNotFoundException(String id) { super("No order " + id); }
}
```

- Never catch `Exception` and print — you will swallow the bug.
- Always **wrap** third-party exceptions with context: `throw new PaymentError("Stripe charge failed", e)`.
- Do not use exceptions for normal control flow in hot paths (a `getOrDefault` beats a thrown
  key lookup in a loop).
- Custom exceptions should carry the data the caller needs to handle them (`shortfall`,
  `orderId`) — a message string alone is not an API.

### 1.7 `Optional` and modern Java ergonomics

```java
// Return Optional, never accept or store it as a field. Never Optional.get().
Optional<Customer> find(long id);

// Use orElse / orElseGet / orElseThrow — and remember orElseGet for expensive defaults
Customer c = find(id).orElseGet(() -> loadFromCacheOrCreate(id));

// var for obvious local types only
var order = repo.findById(id).orElseThrow();   // fine: the type is on the same line
```

Also worth knowing: `var` (JDK 10), text blocks (`"""`), switch expressions (JDK 14),
records (16), pattern matching for `instanceof` (16), sealed types (17).

### 1.8 Maven in 5 minutes

```xml
<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>3.5.0</version>          <!-- inherits dependency versions: do NOT pin them yourself -->
</parent>

<properties>
  <java.version>21</java.version>
</properties>

<dependencies>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>  <!-- version comes from the parent -->
  </dependency>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
  </dependency>
</dependencies>
```

**Commands you will use daily:**

```bash
./mvnw spring-boot:run          # run locally
./mvnw test                     # run tests
./mvnw -Dtest=OrderServiceTest test   # one test class
./mvnw clean package            # build the jar
java -jar target/app.jar         # run the built jar
```

**The dependency-management lesson:** never specify `<version>` for a Spring artifact. Let
the parent manage versions; that is how you avoid the CVE-ridden transitive dependency hell
that fills half of Java Stack Overflow.

### 1.9 JUnit 5 in 10 minutes

```java
class OrderServiceTest {

    @Test
    void rejectsOrder_whenStockInsufficient() {
        var repo = mock(OrderRepository.class);
        when(repo.findBySku("SKU-1")).thenReturn(Optional.of(new Product("SKU-1", 2)));
        var service = new OrderService(repo, new PricingService());   // no Spring needed

        assertThatThrownBy(() -> service.place("SKU-1", 5))
            .isInstanceOf(InsufficientStockException.class)
            .hasMessageContaining("SKU-1");
    }
}
```

Note: `new OrderService(...)` — no context, no container, milliseconds per test. **This is
the payoff of constructor injection**, and it is why the rule exists.

---

## 2. Lab — `task-tracker-cli` (the week's main build)

**Spec (no framework, no Spring):**

```
$ ./mvnw -q exec:java -Dexec.mainClass=com.example.tasks.Main
> add "Ship the auth module" high
> add "Write docs" low
> list --status=open --priority=high
> done 1
> stats
```

### 2.1 The domain model

```java
public record Task(int id, String title, Priority priority, Status status, Instant createdAt) {
    public Task {
        if (title == null || title.isBlank()) throw new IllegalArgumentException("title required");
        if (title.length() > 120) throw new IllegalArgumentException("title too long: " + title.length());
    }
    public Task complete() { return new Task(id, title, priority, Status.DONE, createdAt); }
}
```

A compact constructor in a record is a validation point that is **impossible to bypass** —
there is no other constructor. That is a genuine design win over a JavaBean.

### 2.2 Repository interface + JSON implementation

```java
public interface TaskRepository {
    List<Task> findAll();
    Optional<Task> findById(int id);
    Task save(Task task);
    void delete(int id);
}

public final class JsonTaskRepository implements TaskRepository {
    private final Path file;
    private final ObjectMapper mapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .enable(SerializationFeature.INDENT_OUTPUT);

    public JsonTaskRepository(Path file) throws IOException { this.file = file; init(); }

    @Override public List<Task> findAll() {
        try { return mapper.readValue(Files.readString(file), new TypeReference<List<Task>>() {}); }
        catch (IOException e) { throw new RepositoryException("cannot read tasks", e); }
    }
    // ... save() writes atomically: write to temp file, then Files.move(ATOMIC_MOVE)
}
```

**Atomic write** (temp file + `Files.move(..., ATOMIC_MOVE)`) is a real production concern —
do it now and it becomes instinct.

### 2.3 The service layer

```java
public class TaskService {
    private final TaskRepository repo;
    private final Clock clock;

    TaskService(TaskRepository repo, Clock clock) {   // inject Clock: testable time
        this.repo = repo;
        this.clock = clock;
    }

    public Task add(String title, Priority priority) {
        int nextId = repo.findAll().stream().mapToInt(Task::id).max().orElse(0) + 1;
        return repo.save(new Task(nextId, title.trim(), priority, Status.OPEN, clock.instant()));
    }

    public Task complete(int id) {
        return repo.findById(id).orElseThrow(() -> new TaskNotFoundException(id)).complete();
    }

    public List<Task> filter(Status status, Priority priority) {
        return repo.findAll().stream()
            .filter(t -> status == null || t.status() == status)
            .filter(t -> priority == null || t.priority() == priority)
            .sorted(Comparator.comparing(Task::createdAt).reversed())
            .toList();
    }

    public Map<Status, Long> stats() {
        return repo.findAll().stream().collect(Collectors.groupingBy(Task::status, Collectors.counting()));
    }
}
```

Note the injected `Clock`. `Instant.now()` inside a class makes time-dependent tests
flaky and unassertable — this trick (`Clock`, `Random`, `Supplier<T>` as constructor
dependencies) is how you write deterministic tests in any language.

### 2.4 Tests you are proud of

```java
class TaskServiceTest {
    private final InMemoryTaskRepository repo = new InMemoryTaskRepository();
    private final TaskService service = new TaskService(repo, () -> Instant.parse("2026-01-01T00:00:00Z"));

    @Test void assignsSequentialIds() {
        assertThat(service.add("one", Priority.LOW).id()).isEqualTo(1);
        assertThat(service.add("two", Priority.LOW).id()).isEqualTo(2);
    }

    @Test void completionIsIdempotent() {
        service.add("x", Priority.LOW);
        service.complete(1);
        assertThat(service.complete(1).status()).isEqualTo(Status.DONE);
    }

    @Test void unknownIdThrows() {
        assertThatThrownBy(() -> service.complete(99))
            .isInstanceOf(TaskNotFoundException.class).hasMessage("99");
    }
}
```

Aim for **≥ 15 tests**, including a `@ParameterizedTest` over priorities, and 100 % branch
coverage of the service.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Rewrite `for` loops as streams; compare readability | When streams help and when they hurt |
| 2 | Add `dueDate` and implement sorting with `Comparator.comparing` | Comparators and null handling |
| 3 | Make `JsonTaskRepository` crash on a corrupt file; handle it | Defensive parsing, wrapping exceptions |
| 4 | Add a `TaskFilter` record + method reference | Passing functions around |
| 5 | `sealed interface Priority permits LOW, HIGH` + exhaustive switch | Compile-time exhaustiveness |
| 6 | Write a test that fails, then fix the code (never the test) | Red/green discipline |
| 7 | Run `./mvnw test` and read the full Surefire report | Reading build output fluently |

---

## 4. Deliverable — `task-tracker-cli`

- [ ] Record-based domain model with validation in the compact constructor
- [ ] `TaskRepository` interface + JSON implementation with atomic writes
- [ ] Service with injected `Clock`, stream-based filtering, `stats()`
- [ ] ≥ 15 JUnit 5 tests including parameterised and negative cases
- [ ] A `README.md` with the command reference and a test-coverage summary
- [ ] `mvn clean verify` green from a clean checkout

**Self-check before moving on:** could you write a test for any method without starting the
program? If yes, your design is testable — and that is exactly the design Spring rewards.

---

## 5. Cheat sheet

| Task | Reach for |
| --- | --- |
| Immutable data | `record` |
| Closed hierarchy | `sealed` + `switch` expression |
| Thread-safe map | `ConcurrentHashMap` |
| Unique sorted | `TreeSet` |
| Optional without NPEs | `Optional` + `orElseThrow` |
| Convert a list | `stream().map().filter().toList()` |
| Wrap a third-party error | Custom exception with a cause |
| Deterministic tests | Inject `Clock` / `Random` |
| Testable classes | `final` fields, constructor injection |
