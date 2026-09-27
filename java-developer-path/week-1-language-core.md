---
title: "Week 1 — Language Core"
track: "java"
week: 1
order: 1
type: "module"
hours: 16
summary: "Types, immutability, records, sealed hierarchies, generics, enums, switch expressions, pattern matching, var, text blocks, and exceptions."
tags: ["records", "sealed", "generics", "pattern-matching", "switch", "exceptions", "var", "text-blocks"]
---

# Week 1 — Language Core

**Goal by Friday:** a dependency-free domain model built from records, sealed types and
exhaustive switches, compiling warning-free on `--release 21`, with the compiler proving
your cases are complete.

---

## 1. Concepts (3 h)

### 1.1 Immutability is the default you should be fighting for

```java
// Java is mutable by default. Do not accept that as your design.
public record Money(BigDecimal amount, Currency currency) {
    public Money {                                    // compact constructor: validation here
        Objects.requireNonNull(amount, "amount");
        Objects.requireNonNull(currency, "currency");
        if (amount.scale() > currency.getDefaultFractionDigits())
            throw new IllegalArgumentException(
                "amount has more precision than " + currency);
    }

    public Money plus(Money other) {
        if (!currency.equals(other.currency))
            throw new CurrencyMismatchException(currency, other.currency);
        return new Money(amount.add(other.amount), currency);
    }

    public static final Money ZERO_USD = new Money(BigDecimal.ZERO, Currency.getInstance("USD"));
}
```

A record gives you: a canonical constructor, `equals`/`hashCode` by value, `toString`,
and `final` fields. **All of that is correct by construction**, which is why records
replaced so many hand-written DTOs.

**Validate in the compact constructor.** It is the only constructor there is, so it cannot
be bypassed — unlike a JavaBean with a default constructor plus setters.

### 1.2 Sealed types + pattern matching = the compiler checks your switch

This is the most valuable modern feature for application code, and it replaces the visitor
pattern almost everywhere.

```java
// A closed hierarchy: these are the only permitted implementations.
public sealed interface PaymentResult
        permits PaymentResult.Approved, PaymentResult.Declined, PaymentResult.Error {

    record Approved(String authCode, Instant at) implements PaymentResult {}
    record Declined(String reason) implements PaymentResult {}
    record Error(Throwable cause) implements PaymentResult {}
}

static String describe(PaymentResult result) {
    return switch (result) {                       // exhaustive — no default needed
        case PaymentResult.Approved a -> "paid: " + a.authCode();
        case PaymentResult.Declined d -> "declined: " + d.reason();
        case PaymentResult.Error e   -> "error: " + e.cause().getMessage();
    };
}
```

**What this makes impossible:** a new `PaymentResult` implementation that you forget to
handle. The moment you add a record to the `permits` clause, every non-exhaustive switch
stops compiling. That is a whole category of production bug removed by the compiler.

```java
// Java 16 style — you should be able to read this, but stop writing it
if (result instanceof PaymentResult.Approved a) {   // pre-16: check, then cast, hope
    return a.authCode();
}
return "";

// And record patterns, for destructuring (Java 21)
static String label(Order order) {
    return switch (order) {
        case Order.Shipped(String id, Address to) -> id + " -> " + to.city();
        case Order.Pending()                       -> "not yet shipped";
        case Order.Cancelled(String why, _)        -> "cancelled: " + why;
    };
}
```

### 1.3 Switch expressions, and the fall-through bug you can now delete

```java
// Old: statement, fall-through possible, no value produced
int days;
switch (status) {
    case ACTIVE:  days = 30; break;
    case PAUSED:  days = 0;  break;
    default:      days = 0;  break;
}

// New: expression, returns a value, no fall-through, compiler checks exhaustiveness
int days = switch (status) {
    case ACTIVE, TRIAL -> 30;      // multiple labels, comma-separated
    case PAUSED, CANCELLED -> 0;
};
```

```java
// With patterns, guards, and bindings
static String tier(int balanceCents) {
    return switch (balanceCents) {
        case int b when b < 0        -> "OVERDRAWN";
        case 0                       -> "EMPTY";
        case int b when b < 10_000   -> "BASIC";
        case int b when b < 100_000  -> "PLUS";
        default                      -> "PREMIUM";
    };
}
```

**When to use a `switch` statement instead:** when you genuinely want fall-through (a
state machine's next-state transition). Everything else should be a switch expression.

### 1.4 Generics — recognise them, design them rarely

```java
// Read generics fluently
List<? extends Payment> readOnly = payments;      // producer: you can read Payment out
void consume(List<? super Receipt> sink) { }      // consumer: you can write Receipt in

// The idiom you will use daily
Map<String, List<Payment>> byMethod = payments.stream()
    .collect(Collectors.groupingBy(Payment::method));

// Bounded type parameter
static <T extends Comparable<T>> T maxOf(Collection<T> items) {
    return items.stream().max(Comparator.naturalOrder()).orElseThrow();
}

// Type-safe heterogeneous container, when you need one
class Result<T> {
    private final T value;
    private Result(T value) { this.value = value; }
    static <T> Result<T> ok(T value)    { return new Result<>(value); }
    static <T> Result<T> err(String m)  { throw new IllegalStateException(m); }
    T orElse(T fallback) { return value != null ? value : fallback; }
}
```

**PECS: Producer Extends, Consumer Super.** Ten seconds of recall, hours of avoiding
`ClassCastException` at runtime. **You will not design generic frameworks at work — you will
consume them every day, and this is what stops the runtime cast errors.**

### 1.5 Enums, done properly

```java
public enum OrderStatus {
    PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED;

    // Fields and methods are allowed — an enum is a real class
    private static final Set<OrderStatus> TERMINAL =
        EnumSet.of(DELIVERED, CANCELLED);

    public boolean isTerminal() { return TERMINAL.contains(this); }

    public OrderStatus next() {                        // no switch fall-through by accident
        return switch (this) {
            case PENDING   -> CONFIRMED;
            case CONFIRMED -> SHIPPED;
            case SHIPPED   -> DELIVERED;
            case DELIVERED, CANCELLED -> DELIVERED;    // terminal states stay put
        };
    }
}
```

**Enums are better than string constants** because the compiler catches typos, `switch`
exhaustiveness applies, and they can carry data. **Do not use enums for open-ended,
data-driven sets** — those belong in a database table.

### 1.6 `var` — where it helps and where it hurts

```java
// Good: the type is on the same line, or genuinely noisy
var order = repository.findById(id).orElseThrow();     // Optional<Order>
var customers = new HashMap<String, List<Order>>();     // who cares
var start = Instant.now();                              // obviously Instant

// Bad: the type is the whole point
var handler = createHandler(config);                   // what IS this?
var result = process(input);                            // defeats the purpose of typing
```

`var` is a **local variable** feature only. It does not apply to fields, parameters or
return types. The rule: use it when the type is already obvious from the right-hand side.

### 1.7 Text blocks — finally readable embedded SQL and JSON

```java
String query = """
        SELECT o.id, o.total_cents, c.email
          FROM orders o
          JOIN customers c ON c.id = o.customer_id
         WHERE o.status = 'PENDING'
           AND o.created_at > ?
         ORDER BY o.created_at DESC
         LIMIT 50
        """;

var payload = """
        {"event": "order.created",
         "orderId": "%s"}
        """.formatted(orderId());
```

**Incidental indentation is stripped**, which is the entire point. Note the closing delimiter
position controls the indentation baseline. Text blocks also mean **you no longer need
string concatenation for multi-line content** — and therefore fewer injection bugs.

### 1.8 Exceptions — the hierarchy and the rules

```
Throwable
├── Error            — unrecoverable (OutOfMemoryError, StackOverflowError). Do not catch.
└── Exception
    ├── RuntimeException   — unchecked: programming errors (NPE, IllegalArgumentException)
    └── everything else    — checked: recoverable conditions the caller must handle
```

| Situation | Use |
| --- | --- |
| Caller can sensibly recover | Checked exception (`throws`) |
| Programming error / invalid argument | `RuntimeException` subtype |
| Business rule violated | A custom `RuntimeException` with the data the caller needs |

```java
public final class InsufficientFundsException extends RuntimeException {
    private final long shortfallCents;

    public InsufficientFundsException(long requestedCents, long balanceCents) {
        super("short by " + (requestedCents - balanceCents) + " cents");
        this.shortfallCents = requestedCents - balanceCents;   // the caller needs the number
    }

    public long shortfallCents() { return shortfallCents; }
}
```

**Four rules that survive every code review:**

1. **Never catch `Exception` and print it.** You have swallowed the bug.
2. **Always wrap third-party exceptions with context:** `throw new PaymentError("charge failed for " + id, e)`.
3. **Never use exceptions for normal control flow in hot paths** — `map.getOrDefault` beats a thrown lookup.
4. **Always pass the cause** to the constructor. The stack trace of the original failure is
   the thing that saves you at 3am.

---

## 2. Lab — a `Money`/`Payment` domain model (the week's main build)

**Spec:** no frameworks, no collections libraries, just the language. Warning-free.

### 2.1 The model

```
domain/
├── Money.java             record, validation in the compact constructor
├── Payment.java           interface
├── CardPayment.java       record implements Payment
├── BankTransfer.java      record implements Payment
├── WalletPayment.java     record implements Payment
├── PaymentResult.java     sealed interface (Approved | Declined | Error)
├── RefundPolicy.java      sealed interface with exhaustive switch
└── MoneyTest.java         JUnit 5 + AssertJ + parameterised cases
```

### 2.2 Money — the invariants

```java
public record Money(BigDecimal amount, Currency currency) {

    public Money {
        Objects.requireNonNull(amount, "amount");
        Objects.requireNonNull(currency, "currency");
        if (amount.signum() < 0 && !ALLOW_NEGATIVE.contains(currency))
            throw new IllegalArgumentException("negative amount: " + amount);
        if (amount.scale() > currency.getDefaultFractionDigits())
            throw new IllegalArgumentException("too many decimal places: " + amount.scale());
    }

    public Money plus(Money other) {
        if (!currency.equals(other.currency))
            throw new CurrencyMismatchException(currency, other.currency);
        return new Money(amount.add(other.amount), currency);
    }

    public Money multiply(int factor) {
        return new Money(amount.multiply(BigDecimal.valueOf(factor)), currency);
    }

    @Override
    public String toString() {
        return currency.getCurrencyCode() + " " + amount.setScale(
                currency.getDefaultFractionDigits(), RoundingMode.HALF_EVEN);
    }
}
```

Note the `BigDecimal` traps you must handle: always construct from `String` or
`BigDecimal.valueOf(long)` — **never `new BigDecimal(0.1)`**, which is a binary
approximation of the double and will fail an equality assertion. This is the single most
common money bug in Java and it is entirely avoidable.

### 2.3 The sealed hierarchy with an exhaustive switch

```java
static String settlementInstructions(Payment payment, PaymentResult result) {
    return switch (result) {
        case PaymentResult.Approved a -> switch (payment) {          // nested, both exhaustive
            case CardPayment c        -> "capture " + c.last4() + " via " + c.gateway();
            case BankTransfer b       -> "settle to IBAN " + mask(b.iban());
            case WalletPayment w      -> "debit wallet " + w.walletId();
        };
        case PaymentResult.Declined d -> "declined: " + d.reason();
        case PaymentResult.Error e   -> "manual review: " + e.cause().getMessage();
    };
}
```

**Add a fourth `Payment` implementation and run the build.** Both switches break. That
compilation failure is the deliverable — paste it into the README.

### 2.4 Tests that prove the invariants

```java
@ParameterizedTest
@CsvSource({"USD,2,12.345,too many decimal places",
            "USD,2,-5.00,negative amount"})
@DisplayName("rejects amounts that violate currency invariants")
void rejectsInvalidAmounts(String currency, int fractionDigits,
                           String amount, String expectedMessage) {
    var thrown = catchThrowable(() -> new Money(
            new BigDecimal(amount), Currency.getInstance(currency)));

    assertThat(thrown)
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining(expectedMessage);
}
```

Also required: a **property-based** sanity test that `a.plus(b).minus(b).equals(a)` across
random values, and a test that asserts **no currency mixing**.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Compile a switch over a sealed type; add a case type and rebuild | The compiler as a safety net |
| 2 | Write the visitor pattern for the same hierarchy, then delete it | What sealed types replaced |
| 3 | `new BigDecimal(0.1).equals(new BigDecimal("0.1"))` → false | The money trap |
| 4 | Write a record with 8 fields; consider `@Builder` instead | When a record is the wrong shape |
| 5 | Try `var` on a method return type; read the error | `var` is local-only |
| 6 | Turn a string-concatenated SQL string into a text block | Text blocks kill injection bugs |
| 7 | Throw a custom exception with a field; handle it in a catch | Exceptions carry data |
| 8 | Compile with `-Xlint:all -Werror`; fix every warning | Warnings are debt |

---

## 4. Deliverable — the domain model

- [ ] `Money` as a record with all invariants enforced in the compact constructor
- [ ] `Payment` sealed with 3 implementations; `PaymentResult` sealed with 3 outcomes
- [ ] Exhaustive `switch` expressions over both, with nested pattern matching
- [ ] Record patterns for destructuring at least one sealed type
- [ ] A custom exception carrying structured data, with the cause preserved
- [ ] Enums with fields, methods, and an `isTerminal()` style predicate
- [ ] ≥ 20 JUnit 5 tests including `@ParameterizedTest` and nested `@DisplayName` groups
- [ ] Compiles with `-Xlint:all -Werror` on `--release 21`
- [ ] README with the "add a type, watch the build break" demo

---

## 5. Self-check

1. Why validate in a record's compact constructor rather than in a factory method?
2. What is the compiler doing for you in an exhaustive switch over a sealed type?
3. `required: []` — no. Name two things `List<? extends X>` and `List<? super X>` each allow.
4. When is a switch *statement* the right choice over a switch expression?
5. Why is `new BigDecimal(0.1)` a bug, and what do you use instead?
6. Your custom exception carries a `shortfall` field. Why is that better than putting the
   number in the message string?

---

## 6. Cheat sheet

| Need | Reach for |
| --- | --- |
| Immutable data carrier | `record` |
| Validate at construction | Compact constructor + `requireNonNull` |
| Closed set of subtypes | `sealed interface ... permits` |
| Exhaustive dispatch | `switch` expression, no `default` |
| Destructuring | Record patterns in `switch` |
| Multi-value dispatch | `case A, B ->` |
| Data-driven set | Enum with fields and methods |
| Read a collection broadly | `? extends T` |
| Write into a collection | `? super T` |
| Obvious local type | `var` |
| Embedded SQL/JSON | Text block with `.formatted()` |
| Business rule violated | Custom `RuntimeException` carrying data |
| One value from a lookup | `Map.getOrDefault`, not an exception |
