---
title: "Week 7 — Idioms, Design & API Craft"
track: "java"
week: 7
order: 7
type: "module"
hours: 16
summary: "Null safety, immutability, error modelling, the design patterns worth using, domain modelling, API design, backwards compatibility, and code review."
tags: ["null-safety", "immutability", "design-patterns", "ddd", "api-design", "compatibility", "code-review", "clean-code"]
---

# Week 7 — Idioms, Design & API Craft

**Goal by Friday:** a procedural codebase refactored into a modular, immutable, well-typed
domain with a documented public API — and a written note on every design decision you
made and rejected.

**This is the last mile between working code and good code.** Everything here is judgement,
and judgement is only teachable by doing it on real code.

---

## 1. Concepts (3.5 h)

### 1.1 Null safety — the billion-dollar mistake

`NullPointerException` is still the most common production failure in Java. Modern Java has
tools; using them is a decision.

| Tool | Prevents | Cost |
| --- | --- | --- |
| `@NonNull` / `@Nullable` annotations | Documentation only — no runtime effect | Free, but be honest about it |
| **Records + `requireNonNull` in the compact constructor** | Null at construction, permanently | Free, compile-time-ish |
| `Optional<T>` as a return type | Null returns | Free |
| `Objects.requireNonNull` everywhere | Null reaching deep code | Verbose but explicit |
| **Nullability tooling in a checker** (Kotlin interop, JSpecify) | Real static analysis | Requires adopting the annotations |

```java
public record Customer(Long id, String name, Address address) {
    public Customer {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(name, "name");
        address = Objects.requireNonNullElse(address, Address.UNKNOWN);
    }

    public Optional<Address> billingAddress() { ... }   // never return null
}
```

**The rule that actually works:** *a `null` return means the caller has to handle two cases,
and one of them is a crash.* If absence is meaningful, return `Optional`. If it is not
meaningful, make it impossible to represent.

### 1.2 Immutability, and where to stop

```java
// Fully immutable: everything final, no setters, defensive copies on the way in
public final class Order {
    private final UUID id;
    private final List<LineItem> lines;      // List.copyOf, not the passed reference

    public Order(UUID id, List<LineItem> lines) {
        this.id = Objects.requireNonNull(id);
        this.lines = List.copyOf(lines);     // defensive copy, so the caller cannot mutate
    }

    public Order withStatus(OrderStatus status) {     // return a new one
        return new Order(id, lines, status);
    }
}
```

**The test for a properly immutable class:** there is no method that changes its state
after construction. Records get you most of the way; for classes with collections, you must
copy on the way in and never expose the internal reference.

**Where to stop:** do not make a `JPA` entity immutable — the framework requires mutable
fields and identity. The boundary is: **entities are mutable, everything above them is not.**
Keep the mutable part as small as possible.

### 1.3 Modelling errors deliberately

```java
// Three levels of failure, and each deserves a different mechanism
enum Failure { None, Transient, Permanent, Forbidden }

sealed interface Outcome<T> {
    record Success<T>(T value) implements Outcome<T> {}
    record Failure<T>(Failure kind, String message, Throwable cause) implements Outcome<T> {}
}
```

| Failure | Mechanism | Example |
| --- | --- | --- |
| Programming error | Unchecked exception — let it crash | NPE, `IllegalArgumentException` |
| Expected business outcome | `Result`/`Optional` or a typed outcome | Insufficient funds |
| Unrecoverable external state | Unchecked exception with the cause attached | Database unreachable |
| Expected external state | A typed `Failure` value, not an exception | HTTP 404 from a provider |

**The test:** *should the caller reasonably continue?* If yes, return a value. If no,
throw. Converting genuine bugs into return values is how error handling turns into
unreadable code, and it is the most common misuse of `Result` in Java.

**`Optional` is not an error type.** It says "there is no value", not "here is what went
wrong". If the caller needs to distinguish not-found from forbidden from unavailable, you
need a richer type.

### 1.4 The design patterns actually worth using

Most GoF patterns solve problems that modern Java solves better. These earn their place:

| Pattern | Use it when | Skip it when |
| --- | --- | --- |
| **Strategy** | Interchangeable algorithms behind one interface | There is only ever one |
| **Template Method** | A fixed skeleton with a varying step | Composition is clearer |
| **Builder** | 6+ optional constructor parameters | A record or a static factory works |
| **Factory** | Deciding the concrete type at runtime | `new` is always right |
| **Adapter** | Wrapping a third-party API you do not control | You control both sides |
| **Decorator** | Composing optional behaviour at runtime | Inheritance is clearer |
| **Observer** | Events with many, unknown subscribers | A queue is available |
| **Singleton | Almost never** | Use a DI container or a constant |
| **Repository** | Abstracting persistence from the domain | A thin pass-through with no value |

**What replaced the classic patterns:**

| Old | Modern replacement |
| --- | --- |
| Visitor | `sealed` types + pattern matching (compiler-checked) |
| Strategy + null checks | A sealed interface + exhaustive `switch` |
| Null Object | `Optional` |
| Builder for immutables | `record` canonical constructor |
| Singleton | Dependency injection, or a static constant |
| Abstract factory | Sealed interface + a `switch` in one place |

**The judgement to build:** reach for a pattern when the *name* buys you a shared
vocabulary that a reviewer already knows. Do not reach for one because a tutorial used it.

### 1.5 Domain modelling — the highest-leverage design work

```java
// Primitive obsession: the most common design problem in Java codebases
void charge(String customerId, double amount, String currency);   // what is a double amount?

// A domain type makes the invalid states unrepresentable
void charge(CustomerId customerId, Money amount);
```

**The steps, in order:**

1. **Name the nouns in the domain.** They become your types.
2. **Find the invariants** — the rules that must always hold. Put them in the type, so a
   violation is a compile error or an exception at construction, never a corrupted row.
3. **Use sealed types for every "one of these" concept.** Outcomes, states, reasons.
4. **Keep the domain module dependency-free.** No Spring, no JPA, no framework of any kind.
5. **Let the framework adapt to the domain, not the reverse.**

```java
// An aggregate with a real invariant
public record Order(List<LineItem> lines, OrderStatus status, Money total) {
    public Order {
        if (lines.isEmpty()) throw new EmptyOrderException();
        total = lines.stream()
                .map(LineItem::subtotal)
                .reduce(Money.ZERO_USD, Money::plus);
    }
}
```

`total` is **derived, not stored** — it cannot disagree with the lines, because the
constructor computes it. That is the whole idea: **make the invalid state unrepresentable.**

### 1.6 API design, for things other people call

```java
// A public API is a promise. Every signature is a long-term commitment.
public interface OrderService {

    /** Creates an order. The returned id is stable for the life of the order. */
    OrderId create(CustomerId customer, List<LineItem> lines);

    /** @throws OrderNotFoundException if no order exists for {@code id} */
    Order find(OrderId id);

    /** Idempotent: calling twice with the same key returns the first result. */
    Refund refund(OrderId id, Money amount, IdempotencyKey key);
}
```

**The rules that keep a public API usable for years:**

| Rule | Why |
| --- | --- |
| **Domain types in signatures, not primitives** | `double amount` is an unaudited contract |
| **Document the exceptions** in the Javadoc | The caller needs to know what to catch |
| **Be explicit about idempotency** | Retries are universal; say what is safe |
| **Return collections as `List`, never as an array or a stream** | Streams cannot be reused |
| **Do not expose your persistence model** | JPA entities leak lazy-loading failures |
| **Use a `Builder` only when the parameter list is genuinely unwieldy** | Otherwise a record or a static factory |
| **Deprecate, do not break** | See below |

### 1.7 Backwards compatibility

Binary, source, and behavioural compatibility are three different things, and only the
first is often considered.

| Change | Binary | Source | Behaviour | Ship it? |
| --- | --- | --- | --- | --- |
| Add a method to an interface | ❌ breaks implementors | ❌ | — | Avoid, or use a default method |
| Add a method to a **class** | ✅ | ✅ | ✅ | Yes |
| Add a method with a `default` body | ✅ | ✅ | — | Yes |
| Widen a parameter type | ❌ | ❌ | — | No — overload instead |
| Narrow a return type | ❌ | ❌ | — | No |
| Add a field to a class | ✅ | ✅ | ⚠️ serialisation | Yes, if you control the format |
| Remove or rename anything public | ❌ | ❌ | ❌ | Only at a major version |

```java
@Deprecated(forRemoval = true, since = "2.0")
public void oldMethod() { ... }

@Deprecated(forRemoval = true)
public void newMethod() { ... }        // javac warns your own team; they must migrate
```

**The migration path is the point.** `@Deprecated(forRemoval = true)` plus a compiler
warning is a self-enforcing deprecation: every internal caller is told to migrate, and
nothing breaks for external users.

### 1.8 Code review — the reviewer's checklist

**Correctness**
- [ ] Are the edge cases handled — empty, null, one, many?
- [ ] Are the boundaries right, and can an invalid state exist?
- [ ] Is the error path tested?

**Design**
- [ ] Does the domain module have framework dependencies?
- [ ] Is a new abstraction earning its maintenance cost?
- [ ] Is there a `Result`/exception choice that is inconsistent with the rest of the codebase?

**Concurrency**
- [ ] Is shared mutable state actually shared? Is it protected?
- [ ] Is any new concurrency bounded?
- [ ] Is a `Clock` or `RandomGenerator` injected rather than called statically?

**Tests**
- [ ] Would this test fail if the implementation were wrong?
- [ ] Are the assertions about behaviour, or about implementation details?

**Readability**
- [ ] Would a new developer understand this in 30 seconds?

**The two questions that improve every review:** *"What happens if this fails?"* and
*"What did you decide not to do, and why?"*

---

## 2. Lab — refactor a procedural codebase (the week's main build)

**Spec:** take a working but procedural service and rebuild it as a modular domain.

### 2.1 Before — what procedural Java looks like

```java
// The code that works, and that nobody can change safely
public class OrderService {
    private Map<String, Order> orders = new HashMap<>();
    private double taxRate = 0.2;

    public String create(String customerId, List<String> skus, List<Integer> qtys) {
        double total = 0;
        for (int i = 0; i < skus.size(); i++) {
            Product p = findProduct(skus.get(i));
            if (p == null) throw new RuntimeException("no product " + skus.get(i));
            if (p.stock < qtys.get(i)) throw new RuntimeException("out of stock");
            total += p.price * qtys.get(i);
        }
        total = total * (1 + taxRate);
        String id = UUID.randomUUID().toString();
        orders.put(id, new Order(id, customerId, total));
        return id;
    }
}
```

**Enumerate what is wrong before you change anything** — this list *is* the exercise:

- `double` for money, and tax rate as a mutable field
- `RuntimeException` with string messages for every failure
- Raw `List<String>` and `List<Integer>` instead of a `LineItem` type
- Mutable static-ish state, so it cannot be tested or run as two instances
- `null` returned by `findProduct` and immediately dereferenced
- No test is possible without touching the database

### 2.2 After — the same behaviour, made hard to misuse

```java
// domain — zero dependencies
public record LineItem(Sku sku, Quantity quantity, Money unitPrice) {
    public LineItem {
        Objects.requireNonNull(sku);
        if (quantity.value() <= 0)
            throw new IllegalArgumentException("quantity must be positive: " + quantity);
        Objects.requireNonNull(unitPrice);
    }

    public Money subtotal() { return unitPrice.multiply(quantity.value()); }
}

public record Order(OrderId id, CustomerId customer, List<LineItem> lines,
                    Money total, OrderStatus status) {
    public Order {
        if (lines.isEmpty()) throw new EmptyOrderException();
        total = lines.stream().map(LineItem::subtotal)
                     .reduce(Money.ZERO_USD, Money::plus);   // derived, cannot disagree
    }
}

public sealed interface CheckoutResult {
    record Placed(OrderId id, Money total) implements CheckoutResult {}
    record Rejected(RejectionReason reason) implements CheckoutResult {}

    enum RejectionReason { OUT_OF_STOCK, UNKNOWN_SKU, PAYMENT_DECLINED }
}

// service — depends on domain and on ports, nothing else
public final class OrderService {
    private final ProductRepository products;
    private final TaxPolicy taxPolicy;
    private final PaymentGateway payments;
    private final Clock clock;

    public OrderService(ProductRepository products, TaxPolicy taxPolicy,
                        PaymentGateway payments, Clock clock) { ... }

    public CheckoutResult checkout(CustomerId customer, List<LineItem> lines) {
        for (var line : lines) {
            var product = products.find(line.sku())
                    .orElseThrow(() -> new UnknownSkuException(line.sku()));
            if (product.stock().isLessThan(line.quantity()))
                return new Rejected(RejectionReason.OUT_OF_STOCK);
        }
        var subtotal = lines.stream().map(LineItem::subtotal)
                            .reduce(Money.ZERO_USD, Money::plus);
        var total = taxPolicy.apply(subtotal);
        var payment = payments.charge(customer, total);

        return payment.approved()
                ? new CheckoutResult.Placed(orderRepository.save(
                        new Order(OrderId.random(), customer, lines, total,
                                  OrderStatus.PAID)), total)
                : new CheckoutResult.Rejected(RejectionReason.PAYMENT_DECLINED);
    }
}
```

**Count the differences that matter:** money is a type, the tax rate is injected, failures
are a sealed type, every dependency is injected (including `Clock`), `total` cannot
disagree with `lines`, and **it is now unit-testable with four constructor arguments and no
Spring context.**

### 2.3 Prove it

```java
class OrderServiceTest {
    private final InMemoryProducts products = new InMemoryProducts();
    private final OrderService service = new OrderService(
            products, new StandardTaxPolicy(new BigDecimal("0.20")),
            new FakePayments(), Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), UTC));
}
```

Then keep **every behavioural test from the old suite** and confirm they all still pass
against the new implementation. That is the proof the refactor changed nothing observable —
and it is the test that catches an accidental behaviour change, which is the real risk.

### 2.4 The written artefact

For each significant change, one paragraph:

> **Money became a type.** *Why:* `double` cannot represent 0.1, and tax arithmetic on
> doubles produced off-by-a-cent failures that only appeared in production totals.
> *Rejected:* `long` cents — works, but forces every caller to know the currency, and we
> have three. *Consequence:* `Money` is now the boundary type; the persistence layer
> converts once.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Replace a `double` amount with `Money`; find the callers you broke | The compiler is counting your consumers |
| 2 | Rewrite a `if`/`else if` type-check chain as a sealed `switch` | The compiler covers the new case |
| 3 | Find one place throwing `RuntimeException` for an expected outcome | Errors that are not exceptional |
| 4 | Make a class immutable; count the setters you delete | Immutability is a net simplification |
| 5 | Add a method to a public interface; watch every implementor break | Interfaces are commitments |
| 6 | Deprecate a method with `forRemoval` and compile your own codebase | Self-enforcing deprecation |
| 7 | Review a real PR and find one thing that is not a formatting opinion | Review is judgement |

---

## 4. Deliverable — the refactored codebase

- [ ] A `domain` module with **zero** framework dependencies, enforced by a test
- [ ] Every primitive-obsession parameter replaced with a domain type
- [ ] All "one of these" concepts modelled as `sealed` interfaces
- [ ] All expected failures returned as typed values; genuine bugs left as exceptions
- [ ] `Clock` and every external dependency injected; no statics
- [ ] Derived state computed in constructors, never stored and drifted
- [ ] The entire original behavioural test suite passing against the new code
- [ ] ≥ 3 new tests for edge cases the old suite could not express
- [ ] An ADR-style paragraph for each of 5 significant decisions, including what you
      rejected
- [ ] A `README.md` with before/after LOC, a dependency diagram, and the test results

---

## 5. Self-check

1. When does `Optional` make things worse, not better?
2. Why must an immutable class defensively copy an incoming `List`?
3. Which design patterns has modern Java made unnecessary, and what replaced them?
4. Your team adds a method to a widely-implemented interface. What breaks, and what is the
   safe alternative?
5. What makes a design decision "earn its abstraction cost"?
6. What is the one question that improves every code review you have ever written?

---

## 6. Cheat sheet

| Situation | Reach for |
| --- | --- |
| Null is possible and meaningful | `Optional` as a return type |
| Null is not possible | `requireNonNull` in the compact constructor |
| Expected business failure | Sealed `Outcome` / `Result` type |
| Genuine bug | Unchecked exception — let it crash |
| "One of these N things" | `sealed` interface + exhaustive `switch` |
| Invariant that must always hold | Enforce in the constructor |
| State that can be computed | Derive it; do not store it |
| Interchangeable algorithm | Strategy behind an interface |
| 6+ optional parameters | Builder, or a record with a static factory |
| Deprecating public API | `@Deprecated(forRemoval = true)` |
| Adding to a public interface | A `default` method |
| Reviewing code | "What happens if this fails?" |
