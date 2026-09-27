---
title: "Week 3 — Concurrency & Modern Concurrency"
track: "java"
week: 3
order: 3
type: "module"
hours: 18
summary: "The memory model, locks, atomics, CompletableFuture, executors, virtual threads, structured concurrency, and scoped values — with measured numbers."
tags: ["concurrency", "virtual-threads", "structured-concurrency", "scoped-values", "completablefuture", "locks", "atomics"]
---

# Week 3 — Concurrency & Modern Concurrency

**Goal by Friday:** a blocking-I/O service rewritten on virtual threads with structured
concurrency bounding the fan-out, and a measured before/after throughput number you can
defend.

**This is the biggest change to Java concurrency since 2004.** If you take one module
seriously, take this one.

---

## 1. Concepts (3.5 h)

### 1.1 The memory model, in the minimum useful form

The Java Memory Model defines what a thread is *guaranteed* to see.

| Guarantee | Meaning |
| --- | --- |
| **Atomicity** | A read/write of a single variable is indivisible — but *not* for `long`/`double` on 32-bit VMs (or pre-Java 5) |
| **Visibility** | A write by one thread is guaranteed visible to another only after a happens-before edge |
| **Ordering** | Program order is preserved; without synchronisation, the compiler and CPU may reorder |

**Happens-before** is the whole concept. There is one if:
- the write happens before a `synchronized` unlock and another thread's `synchronized` lock
  of the same monitor,
- a write before a `volatile` write and a subsequent `volatile` read (volatile gives
  visibility *and* ordering),
- a write before a task is submitted to an `ExecutorService` and after the task's start,
- a write before `Thread.start()` in the starting thread and after `join()` in the joining
  thread.

```java
// Broken: a plain field is not guaranteed visible
private boolean running = true;

public void stop() { running = false; }            // may NEVER be seen

// Fixed: volatile gives visibility + ordering
private volatile boolean running = true;
```

**Three things that are not synchronisation:** `Thread.yield()`, `System.gc()`, and
reading a field that is only ever written by one thread. Only the first two are irrelevant
noise; the third is the *actual* answer for immutable data.

### 1.2 The old toolkit, and when you still need it

```java
// Mutual exclusion
private final ReentrantLock lock = new ReentrantLock();
lock.lock();
try { /* critical section */ } finally { lock.unlock(); }

private final StampedLock sl = new StampedLock();   // optimistic reads, for hot counters
long stamp = sl.tryOptimisticRead();
if (!sl.validate(stamp)) { stamp = sl.readLock(); stamp = sl.unlockRead(); }

// Atomics
private final AtomicLong requestCount = new AtomicLong();
requestCount.incrementAndGet();
private final LongAdder counter = new LongAdder();  // far better under write contention

// Concurrent collections
ConcurrentHashMap<String, Order> orders = new ConcurrentHashMap<>();
BlockingQueue<Task> queue = new LinkedBlockingQueue<>(10_000);
```

**The three classic concurrency bugs — know the shape of each:**

1. **Lost update:** `count = count + 1` from two threads. Fix: `AtomicInteger` / `LongAdder`.
2. **Check-then-act (TOCTOU):** `if (!map.containsKey(k)) map.put(k, v)`. Fix: `computeIfAbsent`.
3. **Deadlock:** two locks acquired in opposite orders. Fix: consistent lock ordering, or
   one lock.

```java
// TOCTOU — broken
if (!cache.containsKey(key)) cache.put(key, compute(key));

// Fixed: atomic
cache.computeIfAbsent(key, this::compute);
```

**You still need all of this.** Virtual threads do not make shared mutable state safe —
they change *when* you need to reason about concurrency, not *whether*.

### 1.3 `CompletableFuture` — composition, not threads

```java
// The right way: describe the pipeline
CompletableFuture<User> user  = fetchUser(id);
CompletableFuture<Order> order = fetchOrder(id);

CompletableFuture<Receipt> receipt = user
    .thenCombine(order, (u, o) -> new Receipt(u, o))       // join two async results
    .thenApply(this::charge)                               // then transform
    .thenCompose(this::persist)                            // then go async again
    .exceptionally(ex -> Receipt.failed(ex.getMessage()));  // never leave a CF unwrapped

// Concurrent fan-out
CompletableFuture.allOf(fetchA(id), fetchB(id), fetchC(id)).join();

// Racing providers — first to succeed wins
CompletableFuture.anyOf(attemptStripe(id), attemptAdyen(id), attemptManual(id));

// With a real timeout
user.orTimeout(2, TimeUnit.SECONDS)
    .exceptionally(ex -> new User.Anonymous());            // degrade, don't explode
```

**Rules that keep it readable:**
- `thenApply` (sync transform) vs `thenCompose` (returns a `CF` — the one people get
  wrong and accidentally nest futures).
- **Never block inside a `thenApply`.** `.join()` on another future inside a stage means
  you have blocked a pool thread and lost the benefit entirely.
- **Use `orTimeout`, not an unbounded `join`.**
- `supplyAsync` uses the **common ForkJoinPool**. If your work blocks, that pool starves
  and unrelated code slows down for reasons nobody can explain. Pass your own executor.

### 1.4 Virtual threads (Java 21, final) — the actual change

A virtual thread is a **JVM-scheduled thread that is not bound to an OS thread**. When it
blocks, the carrier thread is released and can run something else.

```java
// Before: 10,000 blocking calls need 10,000 platform threads. You cannot.
ExecutorService pool = Executors.newFixedThreadPool(10_000);
pool.submit(() -> legacyHttpClient.get(url));          // 10,000 OS threads. Do not.

// After: 10,000 virtual threads, ~1 MB of heap total, a handful of carrier threads.
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    var results = urls.stream()
        .map(url -> executor.submit(() -> httpClient.get(url)))
        .map(CompletableFuture::join)                    // still a blocking client — fine!
        .toList();
}
```

**The reframe that makes it click:** virtual threads make the **thread-per-request model
viable again**. It is not about raw CPU throughput — it is about *concurrency of blocking
work*, and it removes the need for reactive libraries in a huge class of services.

**What virtual threads do NOT fix:**

| Still required | Why |
| --- | --- |
| Synchronisation for shared mutable state | Carrier threads can move between platforms; your data race is still a data race |
| `synchronized` pin carriers | A virtual thread blocking inside `synchronized` can **pin** its carrier (mitigated in modern JDKs, but the advice stands: avoid blocking under a lock) |
| Bounded concurrency | 1M virtual threads hitting one database is still 1M connections. **Use `Semaphore` or structured concurrency** |
| Connection pools sized for a blocking model | The bottleneck moves to the database |

**The one rule that matters:** if you have a `Semaphore`-like bound anywhere, virtual
threads are safe. If you do not, you have moved your overload problem from threads to
database connections.

```java
Semaphore permits = new Semaphore(50);      // never more than 50 in flight
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    var futures = ids.stream().map(id -> executor.submit(() -> {
        permits.acquire();
        try { return fetch(id); } finally { permits.release(); }
    })).toList();
}
```

### 1.5 Structured concurrency (preview since 24, refined in 25/26)

**The problem it solves:** a fire-and-forget `Thread.ofVirtual().start(...)` outlives the
method that started it. If the parent finishes, the child keeps running, and failures are
invisible.

```java
// Preview API — compile with --enable-preview, learn it, do not ship it
try (var scope = StructuredTaskScope.open()) {           // (naming varies by JDK release)
    var user  = scope.fork(() -> fetchUser(id));
    var orders = scope.fork(() -> fetchOrders(id));

    scope.join();                                          // or joinUntil / ShutdownOnFailure
    return new Dashboard(user.get(), orders.get());       // all children complete
}
// Leaving the block cancels or waits for every child. Failures propagate.
```

The guarantees: **every child finishes before the parent continues**; a child's failure
can fail the parent; and lifetime is lexically scoped. That is the "structured" part.

> ⚠️ This is a **preview** API. It has been renamed between releases. Check the current JEP
> before you write it, and never build production on a preview feature.

### 1.6 Scoped values (Java 25, final) — the ThreadLocal successor

```java
// The old way: a ThreadLocal that you must remember to clear, and which does not
// propagate to a virtual thread's child unless you wrap every executor.
private static final ThreadLocal<RequestContext> CURRENT = new ThreadLocal<>();

// The new way
ScopedValue<RequestContext> REQUEST = ScopedValue.newInstance();

void handle(HttpRequest request, HttpResponse response) {
    ScopedValue.where(REQUEST, new RequestContext(request.id(), request.tenant()))
        .run(() -> {
            handleInner(request, response);        // readable here and in callees
        });
}

void handleInner(HttpRequest request, HttpResponse response) {
    audit.log(REQUEST.get().tenantId());            // implicit, cannot be forgotten
}
```

**Why this is a genuine improvement:**

| `ThreadLocal` | `ScopedValue` |
| --- | --- |
| Mutable — any code can `set` and leak across tasks | **Immutable** — you cannot rebind it |
| Must be `remove()`d in a `finally`, and people forget | Lifetime is lexical; it cannot leak |
| Inheritable variants are a trap with thread pools | **Propagates to child virtual threads automatically** |
| Context bleeds across pooled tasks | Correct under structured concurrency |

That third row is the big one: with a thread pool and `ThreadLocal`, you have had to choose
between leaking a `User` into the next request or paying to wrap every task. Scoped values
remove the choice.

---

## 2. Lab — virtual-thread service (the week's main build)

**Spec:** fetch 1,000 URLs with a deliberately *blocking* HTTP client and measure.

### 2.1 The baseline (platform threads)

```java
static Duration fetchAllPlatformThreaded(List<URL> urls) throws Exception {
    var pool = Executors.newFixedThreadPool(200);
    try {
        var start = Instant.now();
        var futures = urls.stream()
            .map(url -> pool.submit(() -> BLOCKING_CLIENT.get(url)))   // blocking client
            .toList();
        for (var f : futures) f.get();
        return Duration.between(start, Instant.now());
    } finally {
        pool.shutdown();
    }
}
```

Run it with 1,000 URLs. **Write down the wall time and the peak thread count.**

### 2.2 The virtual-thread version, bounded

```java
static Duration fetchAllVirtualThreaded(List<URL> urls) {
    Semaphore permits = new Semaphore(64);      // the bound that makes this safe
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
        var start = Instant.now();
        var futures = urls.stream().map(url -> executor.submit(() -> {
            permits.acquire();
            try { return BLOCKING_CLIENT.get(url); }
            finally { permits.release(); }
        })).toList();

        for (var f : futures) f.join();
        return Duration.between(start, Instant.now());
    }
}
```

Then run it **without the semaphore** and watch the connection pool or the rate limiter
blow up. That failure is the lesson, and it is the thing senior interviewers probe for.

### 2.3 Record the numbers

```java
record Bench(String name, int urls, int concurrency, Duration wall, int peakThreads) {}

static void report(Bench b) {
    System.out.printf("%-24s urls=%-5d conc=%-4d wall=%-6d ms  peakThreads=%d%n",
            b.name(), b.urls(), b.concurrency(), b.wall().toMillis(), b.peakThreads());
}
```

| Configuration | URLs | Concurrency | Wall time | Peak threads |
| --- | --- | --- | --- | --- |
| Platform threads | 1,000 | 200 | _measure_ | _measure_ |
| Virtual, bounded | 1,000 | semaphore(64) | _measure_ | ~carrier count |
| Virtual, unbounded | 1,000 | 10,000 | _expect worse_ | _measure_ |

**The argument you should be able to make:** virtual threads do not make one task faster —
they make *many blocking tasks* feasible without a hand-tuned pool size. The win is
throughput at high concurrency, and it disappears the moment your work stops blocking.

### 2.4 Port the context propagation

```java
// Before: ThreadLocal + executor wrapping, easy to get wrong
static final ThreadLocal<Tenant> TENANT = new ThreadLocal<>();

// After: ScopedValue, and it propagates into the virtual threads for free
static final ScopedValue<Tenant> TENANT = ScopedValue.newInstance();

static ScopedValue<ScopedValue<RequestContext>> CONTEXT =
        ScopedValue.<RequestContext>newInstance().orElse(null);   // optional value

static void main(String[] args) {
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
        ScopedValue.where(CONTEXT, new RequestContext("t-1", "u-9")).run(() -> {
            urls.forEach(u -> executor.submit(() -> handle(u)));   // context flows in
        });
    }
}

static void handle(URL url) {
    var ctx = CONTEXT.get();                 // non-null inside the scope
    log.info("{} fetching {} as {}", ctx.tenantId(), url, ctx.userId());
}
```

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Increment a plain `int` from 8 threads; count the loss | Why atomics exist |
| 2 | `containsKey` + `put` from 2 threads; use `computeIfAbsent` | TOCTOU |
| 3 | Two locks acquired in opposite order; produce a deadlock | Lock ordering |
| 4 | Block inside `synchronized` on a virtual thread; observe the carrier | Pinning |
| 5 | Virtual threads with no bound, hitting a 20-connection pool | Overload moves, it does not vanish |
| 6 | `thenApply` vs `thenCompose`; nest futures by accident | Flattening |
| 7 | `supplyAsync` a blocking call on the common pool; watch unrelated work stall | Never block a common-pool thread |
| 8 | Use a `ThreadLocal` across a pool; observe leaked context | The problem ScopedValue solves |

---

## 4. Deliverable — the virtual-thread service

- [ ] Platform-thread baseline with measured wall time **and peak thread count**
- [ ] Virtual-thread version with a `Semaphore` bound, measured the same way
- [ ] The unbounded version, run, and the failure documented
- [ ] `ScopedValue`-based request context propagating into child virtual threads
- [ ] A `ThreadLocal` version kept side-by-side, so the difference is visible in the README
- [ ] `CompletableFuture` pipeline with `orTimeout` and no blocking inside a stage
- [ ] A written conclusion: where virtual threads help, where they do not, and what the
      real bottleneck became
- [ ] A test that asserts the concurrency bound is respected

---

## 5. Self-check

1. What exactly does virtual threads change, and what do they not change?
2. Why is a `Semaphore` mandatory rather than optional with virtual threads?
3. What is the happens-before relationship between `Thread.start()` and `join()`?
4. When is a `ThreadLocal` genuinely wrong, and what replaces it?
5. `thenApply` vs `thenCompose` — what happens if you use the wrong one?
6. You move a blocking service to virtual threads and throughput did not improve. Why?

---

## 6. Cheat sheet

| Situation | Use |
| --- | --- |
| Visibility across threads | `volatile`, or a happens-before edge |
| Lost updates | `AtomicInteger` / `LongAdder` |
| Check-then-act | `computeIfAbsent` |
| Mutual exclusion | `ReentrantLock`, always `try/finally` |
| Many blocking tasks | Virtual threads **+ a bound** |
| Async composition | `CompletableFuture` with `thenCompose` |
| Two async results | `thenCombine` |
| First success wins | `anyOf` |
| Blocking inside a pool task | Give it a dedicated executor |
| Per-request context | `ScopedValue` (25+), not `ThreadLocal` |
| Bounded child tasks | Structured concurrency (preview) |
| Deadlock | Consistent lock ordering |
