---
title: "Projects & Capstone"
track: "java"
week: 7
order: 8
type: "project"
hours: 16
summary: "Six builds that exercise the whole language, runtime and toolchain — from a dependency-free CLI to a tuned, profiled service."
tags: ["projects", "capstone", "portfolio", "jvm", "concurrency"]
---

# Projects & Capstone

Java is a language you learn by *rewriting* things you already know how to do badly.
Every project here has a specific mechanism it exists to teach — implement it, break it,
fix it, and you own it.

---

## Project 1 — `task-tracker-cli` (Week 1–2)
**Teaches:** records, sealed types, exhaustive switches, collections, streams, `Optional`.

- [ ] Record-based domain with invariants in compact constructors
- [ ] Sealed `TaskStatus` with an exhaustive switch in every operation
- [ ] Repository interface + a JSON file implementation with **atomic** writes
- [ ] Stream-based filtering, sorting, and `groupingBy` statistics
- [ ] `Optional` throughout; zero `null` returns
- [ ] `Money`-style value type with the `BigDecimal` traps handled
- [ ] `try-with-resources` on every file handle
- [ ] ≥ 30 JUnit 5 tests: `@Nested`, `@ParameterizedTest`, edge cases
- [ ] Compiles with `-Xlint:all -Werror` on `--release 21`

**Demonstrate:** add a fourth `TaskStatus` and show every non-exhaustive switch breaking.

---

## Project 2 — `log-analyzer` (Week 2 + 4)
**Teaches:** performance-minded streams, NIO, `java.time`, compiled regex.

- [ ] Streams 10,000 log files and aggregates errors by service and hour
- [ ] `Files.lines` in try-with-resources; never `readAllBytes` on a large file
- [ ] Precompiled `Pattern` with a benchmark proving why
- [ ] Correct time types: `Instant` for events, `Duration` for elapsed
- [ ] Deterministic, sorted output so runs are diffable
- [ ] A test that proves file descriptors are released, including on the failure path
- [ ] Measured throughput on 1M lines, and the algorithmic change that bought it

---

## Project 3 — `concurrent-fetch` (Week 3)
**Teaches:** virtual threads, structured concurrency, `ScopedValue`.

- [ ] Platform-thread baseline: measured wall time **and** peak thread count
- [ ] Virtual-thread version with a `Semaphore` bound, measured identically
- [ ] The unbounded version, run, and the failure documented
- [ ] `ScopedValue`-based request context propagating into child virtual threads
- [ ] A `ThreadLocal` version kept side-by-side so the difference is visible
- [ ] `CompletableFuture` pipeline with `orTimeout`, and no blocking inside a stage
- [ ] A test asserting the concurrency bound is respected
- [ ] **A written conclusion:** where virtual threads help, where they do not, and what the
      real bottleneck became

---

## Project 4 — `inventory-service` (Week 5 + 6)
**Teaches:** the toolchain, the test pyramid, and the JVM.

- [ ] Multi-module Maven: `domain` / `service` / `adapter-persistence`
- [ ] A test proving the domain module has **zero** framework dependencies
- [ ] Unit tests (no Spring), slice tests, and Testcontainers integration tests
- [ ] Slow tests tagged and excluded from the default run
- [ ] SpotBugs clean; `-Xlint:all -Werror` enforced
- [ ] An ArchUnit test for the module boundaries
- [ ] JFR recordings before and after a deliberate performance fix
- [ ] GC log analysis, with allocation rate and pause times compared
- [ ] Documented container flags including `MaxRAMPercentage` and OOM handling

---

## Project 5 — `jvm-lab` (Week 6)
**Teaches:** the runtime, by making it misbehave on purpose.

- [ ] Four experiments, each isolated and measured:
  - **Allocation:** boxing in a loop vs a primitive array; allocation rate from JFR
  - **Contention:** `AtomicLong` vs `LongAdder` at 1 and 64 threads; p99 comparison
  - **Leak:** a static `Map` retaining requests; heap dump and dominator-tree analysis
  - **Deadlock:** two locks in opposite order; read the JVM's deadlock report
- [ ] JFR recording for each, with the top allocation site identified
- [ ] A README table: experiment, metric, before, after, explanation
- [ ] Containerised run with a memory limit, demonstrating the `MaxRAMPercentage` fix

---

## Project 6 — `domain-refactor` (Week 7)
**Teaches:** the judgement, on real code.

- [ ] Take a procedural codebase (yours, or an open-source project you have contributed to)
- [ ] Enumerate every design problem **before** changing anything — that list is the
      deliverable
- [ ] Replace primitive obsession with domain types
- [ ] Model "one of these" as sealed types; model expected failures as values
- [ ] Inject `Clock` and every external dependency; remove statics
- [ ] Derive state in constructors rather than storing and drifting it
- [ ] **Every original behavioural test still passes** against the new code
- [ ] ≥ 3 new tests for edge cases the old structure could not express
- [ ] 5 ADRs, each with what you rejected and why

---

## Capstone — a modular Java service, production-grade

Build something real in the domain you know. The requirements are non-negotiable.

**Architecture**
- [ ] Multi-module: `domain` (no dependencies) / `application` / `adapter-in` / `adapter-out`
- [ ] The domain module has zero framework dependencies, enforced by a test
- [ ] Module boundaries enforced with ArchUnit
- [ ] `sealed` types for every state and outcome; no `null` returns

**Correctness**
- [ ] Every invariant enforced at construction, not at the call site
- [ ] All expected failures returned as typed values
- [ ] Idempotency keys on every mutating operation
- [ ] `Clock` and `RandomGenerator` injected; zero `Instant.now()` / `Math.random()` in
      production code

**Concurrency**
- [ ] Virtual threads for all blocking I/O
- [ ] Every concurrent path explicitly bounded (`Semaphore` or a structured-concurrency scope)
- [ ] `ScopedValue` for request context
- [ ] A concurrency test that proves the bound holds

**Quality**
- [ ] Test pyramid: unit, slice, Testcontainers integration; slow tests tagged
- [ ] `mvn clean verify` green; SpotBugs clean; `-Xlint:all -Werror`
- [ ] JaCoCo gate that fails on coverage **regression**
- [ ] JFR recording of a load run, with an analysis

**Operations**
- [ ] `Dockerfile` with `MaxRAMPercentage`, `ExitOnOutOfMemoryError`, and
      `HeapDumpOnOutOfMemoryError`
- [ ] Structured logging with a correlation id
- [ ] Health and readiness endpoints
- [ ] A measured load-test report: throughput, p50/p95/p99, error rate, GC pauses
- [ ] Documented container flags with the reasoning for each

**Documentation**
- [ ] `README.md` with architecture in ASCII, run instructions, and the real numbers
- [ ] Public API with Javadoc that documents every thrown exception
- [ ] At least 3 ADRs including one thing you decided *not* to do
- [ ] A "what I'd do next" section

**Definition of done:** a colleague can clone it and run `./mvnw verify` and `./mvnw
spring-boot:run` with one command each, and you can defend every architectural choice for
thirty minutes.

---

## Portfolio polish (1 h)

1. **One line with a number:** *"Inventory service: 12k req/s, p99 4 ms, 3,000 virtual
   threads, 41 MB/op allocation, profiled with JFR."*
2. **ASCII architecture** — 10 lines, with the module rule stated inline.
3. **The load-test table**, including p99 and GC pauses. Anyone can claim throughput;
   p99 plus pauses is evidence.
4. **The JFR before/after** for one real fix.
5. **"What I'd do next"** — three items, ordered.
6. **A link to the ADRs**, because that is the artefact a reviewer most wants to read.

---

## The 30-minute project deep-dive (STAR)

| Part | What to say |
| --- | --- |
| **Situation** | The service, its scale, the constraint that hurt most |
| **Task** | The specific problem you owned |
| **Action** | Two or three decisions, each with what you rejected |
| **Result** | A number, and one thing still unresolved |

Example shape:

> *"We had p99 of 800 ms on checkout and the pool was exhausted at 200 threads. I profiled
> it with JFR rather than guessing: 70 % of the time was thread parking on socket reads, not
> CPU — so it was a concurrency-model problem, not a slow query. We moved the blocking
> client onto virtual threads with a semaphore bound of 64. I rejected going reactive
> because the codebase was synchronous and the correctness risk was higher than the gain.
> p99 went to 40 ms and we now run 3,000 concurrent requests on 8 cores. The thing I'd fix
> next is that the semaphore is a hand-tuned constant with no autoscaling."*

That answer demonstrates: you measured, you chose based on evidence, you rejected an
option with a reason, and you are honest about what remains.

---

## After the path: where to go next

| Direction | What to learn | Why it pays |
| --- | --- | --- |
| **Spring Boot** | The [`spring-boot-developer-path`](../spring-boot-developer-path) | The most common Java job |
| **Kotlin** | Coroutines, null safety, multiplatform | Faster to write, interop is total |
| **Reactive** | Project Reactor, `Flow` | The answer when virtual threads do not fit |
| **Performance** | JFR, async-profiler, off-heap, FFM | Scarce, measurable, senior |
| **JVM internals** | OpenJDK source, GC internals, `Unsafe` → FFM | The deepest moat in the ecosystem |
| **Cloud native** | GraalVM native image, Quarkus, CDS/AOT | Faster startup, tiny memory footprint |
