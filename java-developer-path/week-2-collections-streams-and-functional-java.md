---
title: "Week 2 — Collections, Streams & Functional Java"
track: "java"
week: 2
order: 2
type: "module"
hours: 16
summary: "Choosing the right collection, lazy stream pipelines, Collectors, Optional done properly, and functional error handling without exception abuse."
tags: ["collections", "streams", "collectors", "optional", "method-reference", "functional", "result"]
---

# Week 2 — Collections, Streams & Functional Java

**Goal by Friday:** a stream-based analytics pipeline over a large collection, where you can
justify the complexity of every stage and handle absence without scattering `null` checks.

---

## 1. Concepts (3 h)

### 1.1 Pick the collection deliberately

| Need | Use | Complexity | Why |
| --- | --- | --- | --- |
| Key→value | `HashMap` | O(1) avg | The default. Unordered |
| Insertion order | `LinkedHashMap` | O(1) | LRU caches, deterministic output |
| Sorted / range queries | `TreeMap` / `TreeSet` | O(log n) | Navigable, `subMap`, `ceilingKey` |
| Unique, insertion-ordered | `LinkedHashSet` | O(1) | De-duplication preserving order |
| Stack / deque | `ArrayDeque` | O(1) | Replaces the legacy `Stack` |
| Concurrent map | `ConcurrentHashMap` | O(1) | The real answer to "my map broke under load" |
| Immutable view | `List.of` / `Map.of` | — | Constants; throws if mutated |
| Range | `IntStream.range` | — | Avoids `IntStream.iterate` loops |

```java
// The three collection APIs that have caught everyone out
List.of(1, 2, 3);                  // immutable — .add() throws UnsupportedOperationException
Map.of("a", 1, "b", 2);             // immutable
List.copyOf(existing);             // immutable snapshot of a mutable list

new ArrayList<>(other);            // MUTABLE copy — this is the one you usually want
new ArrayList<>(other.size());     // if you know the size, pre-sizing is a real win

Collections.unmodifiableList(x);   // a *view*, not a copy — changes to x are visible
```

**`List.copyOf` vs `unmodifiableList`:** the first takes a defensive **copy**, the second a
live **view**. Use the copy when you are crossing a boundary and you mean it.

### 1.2 Streams are lazy, and that is the whole point

```java
List<Order> expensive = ...;

// Nothing runs until a terminal operation
Stream<Order> pipeline = expensive.stream()
    .filter(this::isOverdue)             // lazy
    .map(this::toView)                   // lazy
    .sorted(Comparator.coming(Order::dueAt));

long count = pipeline.count();           // terminal — NOW it runs
```

| Intermediate (lazy, returns a stream) | Terminal (triggers execution, returns a value) |
| --- | --- |
| `filter` `map` `flatMap` `peek` `sorted` `distinct` `limit` `skip` `takeWhile` | `collect` `reduce` `count` `anyMatch` `allMatch` `noneMatch` `findFirst` `findAny` `forEach` `min` `max` `toList` |

**Three consequences you must internalise:**

1. **Nothing happens without a terminal operation.** A stream that never terminates is a
   no-op, not a bug you will see at runtime.
2. **`forEach` is a terminal operation, not a loop replacement.** Use it when you have a
   side effect and nothing to collect.
3. **Streams are single-use and single-threaded.** You cannot reuse one; a second terminal
   operation throws `IllegalStateException`.

### 1.3 `flatMap` — where it earns its keep

```java
record Customer(String id, String name, List<Order> orders) {}

// One customer -> many orders, flattened into a single stream
List<Order> allOrders = customers.stream()
    .flatMap(c -> c.orders().stream())
    .toList();

// Grouped, which is usually what you actually want
Map<String, List<Order>> byCustomer = customers.stream()
    .collect(Collectors.toMap(Customer::id, Customer::orders));
```

### 1.4 The `Collectors` you will actually use

```java
// groupBy with a downstream computation — the workhorse
Map<Status, BigDecimal> revenueByStatus = orders.stream()
    .collect(Collectors.groupingBy(
        Order::status,
        Collectors.reducing(BigDecimal.ZERO, Order::total, BigDecimal::add)));

// Counting occurrences
Map<String, Long> ordersByCountry = orders.stream()
    .collect(Collectors.groupingBy(Order::country, Collectors.counting()));

// A flat Map<String, String> for lookup tables
Map<String, String> skuToName = products.stream()
    .collect(Collectors.toMap(Product::sku, Product::name, (a, b) -> a));

// Statistics
IntSummaryStatistics stats = numbers.stream().summaryStatistics();
stats.getMin(); stats.getMax(); stats.getAverage();

// Strings
String csv = rows.stream().map(Object::toString).collect(Collectors.joining(", "));

// Partitioning — a clean two-way split
Map<Boolean, List<Task>> byOverdue = tasks.stream()
    .collect(Collectors.partitioningBy(Task::isOverdue));
```

**`toMap` throws on duplicate keys** unless you supply a merge function. That exception is a
feature: it means your key was not actually unique, and you want to know now. When
duplicates are legitimate, pass the merge function deliberately — `(a, b) -> a` silently
keeps the first, which is a decision you should make consciously.

### 1.5 Parallel streams — mostly the wrong tool

```java
orders.parallelStream().map(this::enrich).toList();
```

**Know when it helps and when it hurts:**

| Helps | Hurts |
| --- | --- |
| Large collections, CPU-bound, no shared mutable state | Small collections — the fork/join setup costs more |
| Independent, expensive per-element work | Anything with a `forEach` side effect that must be ordered |
| Plenty of cores available | Blocking I/O — a parallel stream uses a **common ForkJoinPool**, so blocking tasks can starve the JVM |

**For I/O-bound work, virtual threads (Week 3) are the correct answer, not parallel streams.**
That is a genuinely important distinction and it is a common interview trap.

### 1.6 `Optional` done properly

`Optional` is a **container for a possibly-absent return value**. That is the design intent,
and the rules follow from it.

```java
// Correct uses
Optional<Order> findById(long id);
Optional<Customer> findByEmail(String email);

// Also defensible: a stream terminal
String firstName = names.stream().filter(n -> n.startsWith("A")).findFirst().orElse("Anonymous");
```

| Rule | Why |
| --- | --- |
| Never `Optional` a field or parameter | It adds a wrapper to data that is *not* optional-looking |
| Never `return Optional.ofNullable(nullable)` from a setter-like method | Same reason |
| Never `.get()` without `.isPresent()` | Use `orElse`, `orElseGet`, `orElseThrow` |
| `orElse(x)` evaluates `x` **eagerly** | Use `orElseGet(() -> x)` when `x` is expensive |
| `orElseThrow()` gives a bare `NoSuchElementException` | Pass a supplier with a real message |
| Never `Optional.isPresent()` + `get()` | The compiler cannot help you; `map`/`flatMap` can |

```java
// The three that matter
repo.findById(id)
    .map(Order::total)
    .orElse(BigDecimal.ZERO);

repo.findById(id)
    .orElseGet(() -> loadFromCacheOrRebuild(id));   // lazy

repo.findById(id)
    .orElseThrow(() -> new OrderNotFoundException(id));
```

```java
// Chaining is where Optional earns its keep
String label = repo.findById(orderId)            // Optional<Order>
    .map(Order::customer)                        // Optional<Customer>
    .map(Customer::address)                      // Optional<Address>
    .map(Address::country)                       // Optional<Country>
    .map(Country::isoCode)                       // Optional<String>
    .filter(code -> code.equals("GB"))           // Optional<String>
    .orElse("unknown");
```

### 1.7 Functional error handling — and why `Result` beats both extremes

Java has two bad habits: throw for everything, or return `null` and hope. The third option
is an explicit result type.

```java
public sealed interface Result<T, E> {
    record Ok<T>(T value) implements Result<T, Nothing> {}
    record Err<E>(E error) implements Result<T, E> {}

    static <T> Result<T, Nothing> ok(T value) { return new Ok<>(value); }
    static <T, E> Result<T, E> err(E error)   { return new Err<>(error); }
}

// Ergonomics: map, flatMap, and a recover
sealed interface Nothing permits Nothing { }   // a truly empty error type

public record Attempt<T, E>(Result<T, E> result) {
    public Attempt { Objects.requireNonNull(result); }

    public static <T, E> Attempt<T, E> of(Result<T, E> r) { return new Attempt<>(r); }
    public boolean isOk()  { return result instanceof Ok; }
    public T orElse(T fallback) {
        return result instanceof Ok ok ? ok.value() : fallback;
    }
    public <R> Attempt<R, E> map(Function<T, R> fn) {
        return result instanceof Ok ok ? new Attempt<>(Result.ok(fn.apply(ok.value()))) : this;
    }
}
```

**Where to use which — the actual rule:**

| Situation | Use |
| --- | --- |
| The caller can recover and it is exceptional | Checked exception |
| The failure is a normal, expected outcome (validation, not-found) | `Result` / `Optional` |
| The failure means the program has a bug | Unchecked exception — do not return it |
| Deep in a `Stream` where exceptions abort the pipeline | `Result` carried through the stream |

**The important nuance:** do not convert every exception to a `Result`. That produces
verbose, unreadable code and hides genuine bugs. Reserve `Result` for **expected business
outcomes** — "insufficient funds", "invalid ISBN", "email already registered".

---

## 2. Lab — analytics pipeline (the week's main build)

**Spec:** 1M `Transaction` records in memory. Produce a report, and prove the complexity
claim.

### 2.1 The pipeline

```java
public final class TransactionReport {

    public record Summary(
        Map<MerchantCategory, BigDecimal> revenueByCategory,
        Map<Currency, BigDecimal> revenueByCurrency,
        BigDecimal total,
        Transaction topTransaction,
        double refundRate) {}

    public static Summary summarise(List<Transaction> transactions) {
        if (transactions.isEmpty())
            throw new IllegalArgumentException("no transactions to summarise");

        // One pass for the grouped aggregates
        var byCategory = transactions.stream()
            .filter(Transaction::isSettled)
            .collect(groupingBy(Transaction::category,
                       reducing(BigDecimal.ZERO, Transaction::amount, BigDecimal::add)));

        var byCurrency = transactions.stream()
            .filter(Transaction::isSettled)
            .collect(groupingBy(Transaction::currency,
                       reducing(BigDecimal.ZERO, Transaction::amount, BigDecimal::add)));

        var total = transactions.stream()
            .filter(Transaction::isSettled)
            .map(Transaction::amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        // The max needs a comparator, not sorted() — sorting is O(n log n), max is O(n)
        var top = transactions.stream()
            .filter(Transaction::isSettled)
            .max(Comparator.comparing(Transaction::amount));

        long refunded = transactions.stream().filter(Transaction::isRefunded).count();
        double refundRate = (double) refunded / transactions.size();

        return new Summary(byCategory, byCurrency, total, top.orElseThrow(), refundRate);
    }
}
```

**The complexity note that makes this senior-level code:** using `max()` rather than
`sorted().findFirst()` turns O(n log n) into O(n). On 1M records that is the difference
between a fast report and a slow one. **Say which operations are single-pass and which are
not** — that is the whole point of the exercise.

### 2.2 Handle absence with the stream, not with `if`

```java
// Bad: a branch inside a stream
transactions.stream().map(t -> t.merchant().isEmpty() ? UNKNOWN : t.merchant().name())
    .forEach(...);

// Better: model absence in the data
transactions.stream()
    .map(t -> Optional.ofNullable(t.merchant()).map(Merchant::name).orElse("UNKNOWN"))

// Best: make the accessor never return null
public Optional<Merchant> merchant() { return Optional.ofNullable(merchant); }
```

### 2.3 Prove it with a benchmark you actually ran

```java
@Test
@Tag("slow")
void summarisesMillionTransactionsInUnder500ms() {
    var transactions = generate(1_000_000);
    long best = Long.MAX_VALUE;
    for (int i = 0; i < 5; i++) {                    // warm up, then measure
        long start = System.nanoTime();
        TransactionReport.summarise(transactions);
        best = Math.min(best, System.nanoTime() - start);
    }
    assertThat(best / 1_000_000).isLessThan(500);
}
```

Run it. Then **change `max()` to `sorted().findFirst()`** and watch the number move. That
before/after is the deliverable.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Build a stream and never terminate it; print anything | Laziness is real |
| 2 | `max()` vs `sorted().findFirst()`, benchmark both | Complexity is a design choice |
| 3 | Call two terminal ops on one stream; read the exception | Streams are single-use |
| 4 | `orElse(expensiveCall())` vs `orElseGet(this::expensiveCall)` | Eager vs lazy defaults |
| 5 | `toMap` with duplicate keys; add a merge function deliberately | The exception is a signal |
| 6 | Parallel-stream a blocking task; watch the common pool stall | Never block a common-pool thread |
| 7 | Write a stream version and a loop version of the same logic | Readability beats cleverness |

---

## 4. Deliverable — analytics pipeline

- [ ] Single-pass grouped aggregates; O(n) where an O(n log n) alternative is obvious
- [ ] Absence handled by `Optional` in the data model, not by `null` checks in the stream
- [ ] `Result` used for at least one expected business failure (e.g. invalid currency)
- [ ] A benchmark test with a warm-up loop and a real threshold
- [ ] A before/after measurement showing what an algorithmic change bought
- [ ] Both a stream implementation and a loop implementation, with a written note on which
      you would keep
- [ ] ≥ 15 tests including edge cases: empty, single element, all refunded, null merchant

---

## 5. Self-check

1. What is the difference between `List.copyOf(x)` and `Collections.unmodifiableList(x)`?
2. Your stream does nothing. What did you forget?
3. `max()` vs `sorted().findFirst()` — what is the complexity difference and does it matter?
4. When is `orElse(expensive())` a bug?
5. `toMap` throws on duplicates. Why is that usually good news?
6. Name a case where a parallel stream is the wrong choice, and what to use instead.

---

## 6. Cheat sheet

| Need | Reach for |
| --- | --- |
| Key→value, fast | `HashMap` |
| Ordered key→value, or LRU | `LinkedHashMap` |
| Sorted / range queries | `TreeMap`, `TreeSet` |
| Thread-safe map | `ConcurrentHashMap` |
| Immutable collection | `List.of` / `Map.of` / `List.copyOf` |
| Defensive mutable copy | `new ArrayList<>(x)` |
| Transform + filter | `stream().map().filter()` |
| Group with a downstream sum | `groupingBy(k, reducing(...))` |
| Count occurrences | `groupingBy(k, counting())` |
| Cheapest maximum | `max(comparator)`, never `sorted()` |
| Possibly-absent return | `Optional` + `orElseGet` / `map` |
| Expected business failure | `Result` / `Attempt` |
| I/O-bound parallelism | Virtual threads (Week 3), **not** parallel streams |
