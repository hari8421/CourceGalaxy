---
title: "Week 6 — The JVM & Performance"
track: "java"
week: 6
order: 6
type: "module"
hours: 16
summary: "Object layout, the JIT, garbage collectors including G1 as the default in Java 27, JFR profiling, and jcmd/jstack/jmap diagnostics."
tags: ["jvm", "garbage-collection", "g1", "zgc", "jit", "jfr", "profiling", "tuning", "performance"]
---

# Week 6 — The JVM & Performance

**Goal by Friday:** you have taken a deliberately slow service, found the bottleneck with
a profiler, fixed it, and can show the before/after numbers with the GC and allocation data
to back it up.

**The rule for this whole module: never guess. Measure, then change one thing, then measure
again.** Guessing at performance is how teams spend a month making something 4 % faster.

---

## 1. Concepts (3.5 h)

### 1.1 Memory layout — why object size matters

A Java object on a 64-bit HotSpot JVM with compressed oops (the default under 32 GB heap):

```
Object header  12 bytes  (mark word 8 + klass pointer 4, compressed)
Fields        4 or 8 bytes each, with padding
```

```java
// Three fields, three different sizes
class A { int x; }                    // 12 + 4 → padded to 16 bytes
class B { long x; }                   // 12 + 8 → 24 bytes (alignment)
class C { long x; long y; }           // 12 + 16 → 32 bytes
class D { Object o; }                 // 12 + 4 → 16 bytes
```

**The consequences that actually bite:**

| Consequence | Why |
| --- | --- |
| **A million small objects is a lot of memory** | Object overhead dominates; a `List<Small>` of 1M entries can be hundreds of MB of *headers* |
| **Padding wastes space** | Field order does not matter to the JVM, but alignment does |
| **Larger `-XX:MaxHeapSize` disables compressed oops** | Above ~32 GB, references become 8 bytes and your heap effectively grows — a classic production surprise |
| **Value objects beat `Integer`/`Long` in lists** | `List<Integer>` boxes every element; a primitive-specialised list does not |

```java
// Boxing is the usual hidden allocation in "fast" code
List<Integer> ids = new ArrayList<>();      // an Integer object per element
int[] primitiveIds = new int[1_000];        // 4 KB total, no objects at all
```

**Escape analysis** is the JVM's counter-move: if an object does not escape a method, the
compiler can eliminate the allocation entirely. It works for small, local, non-escaping
objects — which is exactly what records and small immutable value types are good for.

### 1.2 The JIT — why Java is fast, and when it is not

```
Interpreted  →  C1 (fast compile, basic opts)  →  C2 (slow compile, aggressive opts)
   slow            medium                                fastest
```

| Concept | Meaning |
| --- | --- |
| **Tiered compilation** | The default: C1 for hot-enough methods, C2 for very hot ones |
| **Profile-guided optimisation** | The JIT counts which branches actually run and specialises for them |
| **Deoptimisation** | The JIT assumed something, got it wrong, and decompiles back to the interpreter |
| **Escape analysis** | Stack-allocate or eliminate non-escaping objects |
| **Inlining** | The single most important optimisation; only small methods get inlined |
| **OSR** | On-stack replacement — switch a running loop to compiled code mid-execution |

**The practical consequences:**

1. **Benchmark with a warm-up.** The first few thousand iterations measure the interpreter.
   Always discard warm-up iterations.
2. **Megamorphic call sites kill performance.** If a call site sees 50 different
   implementation types, the JIT can no longer inline it. This is why a
   `List<Object>`-typed structure is a hidden performance cliff.
3. **`final` on classes helps the JIT** by removing a subclass from the type profile.
4. **"Write boring, predictable code" is a real performance strategy.** Branchy,
   polymorphic code defeats the optimiser even when it is algorithmically fine.

### 1.3 Garbage collection — the collectors you must know

| Collector | Model | Best for | Pause behaviour |
| --- | --- | --- | --- |
| **G1** | Region-based, generational | General-purpose, the sensible default | ~10–100 ms targets, adjustable pause goal |
| **ZGC** | Concurrent, generational | Very large heaps, strict low-latency | Sub-millisecond pauses |
| **Shenandoah** | Concurrent | Low latency on modest hardware | Sub-millisecond |
| Parallel | Stop-the-world, throughput | Batch jobs, short-lived processes | Longest pauses, best throughput |
| Epsilon | No collection at all | Testing, benchmarking, short jobs | You run out of memory |

**Java 27 (JEP 523) makes G1 the default garbage collector in every environment**, and Java
26 improved G1 plus added AOT caching that works with any collector. **If you deploy on 21
or 25, G1 is already the default on server-class machines** — the change makes 27
consistent everywhere. The point for you: **G1 is the collector you will actually run.**

```bash
# The five flags that cover almost every case
-XX:+UseG1GC
-XX:MaxRAMPercentage=75.0            # size the heap from the container limit
-XX:+ExitOnOutOfMemoryError         # fail fast, do not limp
-XX:+HeapDumpOnOutOfMemoryError     # get evidence before the crash
-XX:StartFlightRecording=filename=app.jfr,settings=profile
```

**`MaxRAMPercentage` is the single most important container flag.** Without it the JVM sizes
its heap from the *host's* RAM, not the container's limit, and the process gets
OOM-killed by the kernel while the JVM still thinks it has memory. This is the most common
container bug in Java, and it is entirely avoidable.

**What the collectors cannot fix:** a leak is a leak. G1, ZGC and Shenandoah are all
garbage *collectors*, not garbage *disablers*. A static map holding every request ever
processed is retained under every collector.

### 1.4 Reading the GC logs

```bash
# Turn on unified GC logging and analyse it
java -Xlog:gc*,safepoint:file=gc.log:time,level,tags:filecount=5,filesize=20M -jar app.jar
```

What to look for:

| Signal | Meaning |
| --- | --- |
| Pause frequency and duration | Above your latency SLO? G1 is missing its pause goal |
| Promotion rate | Objects surviving two collections — usually an allocation-rate problem |
| Allocation failure / `to-space exhausted` | Full GC, then a very long pause |
| Humongous allocations | Large arrays bypassing the normal path — a G1-specific problem |
| Pause time growing with heap | Either a leak, or a survivor space that is too small |

**Do not tune blind.** Change one flag, produce comparable logs, and compare. A GC tuning
exercise without before/after data is folklore.

### 1.5 JFR — the profiler that runs everywhere

```bash
java -XX:StartFlightRecording=duration=60s,filename=app.jfr,settings=profile -jar app.jar
# or attach to a running process
jcmd <pid> JFR.start name=diag settings=profile duration=60s filename=diag.jfr
```

**Low overhead (1–2 %), production-safe, and it answers nearly every performance question:**

| JFR event type | Answers |
| --- | --- |
| `jdk.ObjectAllocationSample` | Which code is allocating the most? |
| `jdk.CPULoad` / ExecutionSample | Where is the CPU going? |
| `jdk.JavaMonitorEnter` | Where is lock contention? |
| `jdk.GarbageCollection` | Pause times and cause |
| `jdk.ThreadPark` | Where are threads blocking? |
| `jdk.SocketRead` | Time waiting on the network |
| `jdk.FileRead` / `FileWrite` | Time in file I/O |

**The question to answer with JFR is always one of: CPU, allocation, lock contention, or
waiting.** Four categories, and JFR will point at the right one in five minutes.

### 1.6 Diagnostics: `jcmd`, `jstack`, `jmap`, `jstat`

```bash
jcmd <pid> Thread.print                  # same as jstack — where are threads stuck?
jcmd <pid> GC.heap_info                 # heap usage per generation
jcmd <pid> GC.heap_dump /tmp/heap.hprof # take a heap dump
jcmd <pid> JFR.start name=diag duration=60s
jstat -gc <pid> 1000                    # GC counters every second
```

**Reading a thread dump — the pattern to look for:**

```
"http-nio-8080-exec-7"  #31  prio=5  BLOCKED
   java.lang.Thread.State: BLOCKED (on object monitor)
     at com.example.Inventory.reserve(Inventory.java:42)      <-- THE LOCK
   - waiting to lock <0x00000000f1a2b3c0>                      <-- what it wants
     (a com.example.Inventory)
   - locked <0x00000000d4e5f6a0>                                <-- what it holds
     (a com.example.Connection)
```

**"BLOCKED, holding a lock, waiting for another" across two threads in a cycle is a
deadlock** — and the JVM prints `Found one Java-level deadlock` when it detects one. The
pair of conflicting frames is your entire diagnosis.

**A heap dump is the tool for leaks.** Load it into VisualVM or MAT and look at the
**dominator tree**: the objects that, if freed, would free the most memory. A
`static Map` retaining every request is obvious there and invisible everywhere else.

---

## 2. Lab — profile and fix a slow service (the week's main build)

**Spec:** a deliberately inefficient service. Find the bottleneck with evidence, fix it,
and report before/after with GC data.

### 2.1 The instrumentation you need first

```java
@Timed(value = "app.order.checkout", percentiles = {0.5, 0.95, 0.99})
public CheckoutResult checkout(Order order) { ... }

@Timed(value = "app.db.query", percentiles = {0.99})
@Counted
public List<LineItem> findLines(String orderId) { ... }
```

Percentiles, not averages: **an average latency hides exactly the users who are having a
bad time.** A p50 of 20 ms with a p99 of 2,000 ms is not a 20 ms service.

### 2.2 The measurement harness

```java
record Bench(String label, long p50Micros, long p99Micros, long allocationsPerOp) {}

static Bench measure(String label, Runnable task, int iterations, int warmup) {
    for (int i = 0; i < warmup; i++) task.run();          // JIT warm-up, discarded

    var samples = new long[iterations];
    for (int i = 0; i < iterations; i++) {
        long start = System.nanoTime();
        task.run();
        samples[i] = System.nanoTime() - start;
    }
    Arrays.sort(samples);
    return new Bench(label,
            TimeUnit.NANOSECONDS.toMicros(samples[(int) (iterations * 0.50)]),
            TimeUnit.NANOSECONDS.toMicros(samples[(int) (iterations * 0.99)]),
            0);   // allocation count comes from JFR
}
```

### 2.3 The hunt — in this order

```bash
# 1. CPU or waiting? 30 seconds of data settles it
jcmd <pid> JFR.start name=diag settings=profile duration=30s filename=diag.jfr

# 2. Check GC first — it is the cheapest thing to rule out
jstat -gcutil <pid> 1000
#   If O (old gen) climbs and never comes down -> that is a leak, stop and find it.
#   If pause times are high -> allocation rate or heap sizing, before anything else.

# 3. Take a thread dump while it is slow
jcmd <pid> Thread.print > threads.txt
#   BLOCKED threads -> lock contention. RUNNABLE in the same method -> CPU.
#   WAITING with a socket -> the network.
```

### 2.4 The three classic fixes, and what each should move

| Finding | Fix | Should move |
| --- | --- | --- |
| High allocation in a loop | Reuse objects, avoid boxing, primitives over wrappers | GC time, throughput |
| Lock contention on a shared counter | `LongAdder` over `AtomicLong` | p99, dramatically |
| A slow call dominated by waiting | Virtual threads (Week 3) or caching | p99, dramatically |
| `Sequential Scan` on a large table | The right composite index | DB time |
| The heap growing without bound | Static state; find it in the dominator tree | Everything, eventually |

**Record the result honestly.** If the fix bought 15 %, say 15 % and explain why you
expected more — that is a far better engineering artefact than a number you are not sure
about.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Run a container with no `MaxRAMPercentage` and a 512 MB limit; watch it die | The most common Java container bug |
| 2 | Benchmark with and without a warm-up loop | Measuring the interpreter otherwise |
| 3 | Compare `AtomicLong` vs `LongAdder` under 32 threads | Contention costs p99 |
| 4 | Fill a static `Map`; watch the heap climb; find it in a heap dump | Leaks defeat every collector |
| 5 | Take a JFR recording of a busy service; find the top allocation site | Four questions, one tool |
| 6 | Produce a deadlock with two locks; read the JVM's deadlock report | Thread dumps are readable |
| 7 | Force a Full GC; read `jstat` output and interpret each column | The numbers mean something |

---

## 4. Deliverable — the profiled service

- [ ] A deliberately slow service, committed **before** the fix, so the diff is the story
- [ ] p50 / p95 / p99 instrumentation, with percentiles not averages
- [ ] A JFR recording of the slow version and the fast version
- [ ] GC logs for both, with the allocation rate and pause times compared
- [ ] A written diagnosis: CPU, allocation, contention, or waiting — with evidence
- [ ] Exactly one change at a time, each with its own before/after measurement
- [ ] Final `jcmd` flags documented, including `MaxRAMPercentage` and OOM handling
- [ ] A README table: metric, before, after, and the explanation for the gap

---

## 5. Self-check

1. What does `--release` protect against that a JFR recording cannot?
2. Why does a container without `MaxRAMPercentage` get OOM-killed?
3. Your p50 is 20 ms. Your users still complain. Which percentile do you check, and why?
4. What are the four questions JFR is designed to answer?
5. `AtomicLong` vs `LongAdder` — which, and under what contention?
6. G1, ZGC, Shenandoah: which fixes a memory leak?

---

## 6. Cheat sheet

| Symptom | Look at |
| --- | --- |
| Container OOM-killed | `-XX:MaxRAMPercentage`, container limits |
| p99 bad, p50 fine | JFR `ThreadPark` / `SocketRead` — waiting |
| CPU at 100 % | JFR `ExecutionSample` |
| Frequent young GCs | Allocation rate, not a leak |
| Old gen never drops | A leak — dominator tree in a heap dump |
| Threads BLOCKED | `jcmd Thread.print` — lock contention |
| High p99 on counters | `LongAdder` |
| Long GC pauses | JFR `GarbageCollection` events |
| Everything is slow, nothing specific | Warm-up — measure again after JIT |
