---
title: "Java Developer — Start Here"
track: "java"
week: 0
order: 0
type: "overview"
hours: 2
summary: "A 7-week path through modern Java — language core through the JVM, concurrency, tooling, and the design idioms employers actually expect."
tags: ["java", "jdk", "records", "virtual-threads", "maven", "testing", "jvm"]
---

# Java Developer — Start Here

**Who this is for.** Anyone who wants to write modern, production-grade Java — not a
Java-8 relic, and not a framework tour. This is the **language** path.

> **How this relates to the Spring Boot track.** They are companions, not duplicates.
> This track teaches the language, the runtime and the toolchain. The
> [`spring-boot-developer-path`](../spring-boot-developer-path) teaches the framework on
> top of them. If you are going to Spring, do this track first — you will understand every
> annotation, every lambda the framework hands you, and every stack trace far better.

---

## The version landscape (September 2026)

Java ships every six months. Every **even-numbered-then-LTS** pattern means: feature
releases in March and September, and an **LTS every two years**.

| Release | Date | Status | Use it? |
| --- | --- | --- | --- |
| Java 8 | Mar 2014 | EOL for Oracle updates | Only to maintain legacy systems |
| Java 11 | Sep 2018 | LTS, still in service | Legacy enterprise baseline |
| Java 17 | Sep 2021 | LTS, in service | Very common in production today |
| **Java 21** | Sep 2023 | LTS, in service | **Most common enterprise version right now** |
| **Java 25** | Sep 2025 | LTS, in service | **The target for this path** |
| Java 26 | Mar 2026 | Feature release, 6-month support | Skip; no reason to target it |
| **Java 27** | Sep 2026 | **Newest LTS** | Brand new — know what changed, don't deploy on day one |

**The professional recommendation:**

- **Write** code that compiles and runs on **Java 21+** — that is the widest compatibility
  window across the enterprise today.
- **Build and run on Java 25 LTS** — the mature current LTS, with the newest stable features
  and broad tool support.
- **Be aware of Java 27**, the newest LTS, and check the JEP list before adopting it. Two
  headline changes: **G1 becomes the default garbage collector in every environment**, and
  **post-quantum hybrid key exchange for TLS 1.3** enters the JDK.

> ⚠️ **Preview features are not features.** They change and can be removed between
> releases, and compiling with `--enable-preview` locks you to one JDK version. Use them to
> learn, never in production. The one exception people regret: none, so far.

---

## Where the modern features came from

You do not need to learn the old language first and then "upgrade". Learn it once, modern.

| Feature | Since | Why it matters |
| --- | --- | --- |
| Lambdas & streams | 8 | Functional composition in the core language |
| `Optional` | 8 | Explicit absence — misused constantly, covered in Week 2 |
| Modules (`module-info.java`) | 9 | Real encapsulation at the jar boundary |
| `var` | 10 | Removes the type where it is already obvious |
| HTTP client | 11 | Replaces `HttpURLConnection` for real work |
| Switch expressions | 14 | No fall-through bugs, and they return values |
| Text blocks | 15 | Multi-line SQL, JSON, HTML in source |
| Records | 16 | Data carriers with `equals`/`hashCode`/`toString` for free |
| Pattern matching for `instanceof` | 16 | Removes the cast-after-check dance |
| Sealed types | 17 | Closed hierarchies the compiler can check exhaustively |
| Record patterns | 21 | Destructuring in `switch`, in one expression |
| Pattern matching for `switch` | 21 | Type *and* value dispatch, no visitor needed |
| **Virtual threads** | **21** | The biggest change to Java concurrency since 2004 |
| Sequenced collections | 21 | Ordered, deduplicated collection views |
| **Scoped values** | **25** | Safe, immutable per-task context — the ThreadLocal successor |
| Unnamed patterns/variables `_` | 21 (preview) | Explicitly ignoring a binding |

**One idea to carry through the whole track:** Java has been steadily adding *compile-time
safety over runtime introspection*. Sealed types, pattern matching and record patterns are
all the same movement — moving decisions from "check at runtime, hope" to "the compiler
proves it". Where you see a modern Java feature, ask what failure it makes impossible.

---

## The 7-week map

### Week 1 — Language core
Types and the type system, objects and immutability, records, sealed types, generics,
enums, `switch` expressions, pattern matching, `var`, text blocks, exceptions.
- **Lab:** a dependency-free `Money` / domain model using records, sealed types and
  exhaustive switches, with full JUnit coverage.
- **Why first:** everything else is built on this, and this is where the compiler starts
  working for you.

### Week 2 — Collections, streams and functional Java
`Collection` hierarchy and when to pick each, iteration, streams and the lazy pipeline,
`Collectors`, `Optional` done properly, functional error handling.
- **Lab:** a stream-based analytics pipeline over a large collection, with the complexity
  of each stage justified.
- **Why:** this is where Java code either becomes elegant or becomes unreadable.

### Week 3 — Concurrency and modern concurrency
Memory model, `synchronized` and locks, atomics, `CompletableFuture`, executors,
**virtual threads**, **structured concurrency** (preview), **scoped values** (25).
- **Lab:** a blocking-I/O service rewritten on virtual threads, with structured concurrency
  bounding the fan-out — and a measured throughput comparison.
- **Why:** the single largest change to how you write server code since Java 8.

### Week 4 — The modern standard library
`java.time`, `Optional` advanced, I/O and NIO, the HTTP client, text processing and
regular expressions, `RandomGenerator`, and the FFM API (preview) for off-heap memory.
- **Lab:** a file-processing pipeline using NIO, virtual threads, and structured concurrency.
- **Why:** most "I don't know Java well" complaints are really standard-library gaps.

### Week 5 — Build, test and toolchain
Maven and Gradle, dependency management, JUnit 5, AssertJ, Mockito, Testcontainers,
parameterised and nested tests, debugging, static analysis, code generation.
- **Lab:** a properly layered multi-module project with a real test pyramid.
- **Why:** the difference between code that works and code that can be changed safely.

### Week 6 — The JVM and performance
Memory model, object layout, the JIT, garbage collectors (G1, ZGC, Shenandoah), JFR,
`jcmd`/`jstack`/`jmap`, profiling, and tuning with evidence.
- **Lab:** take a deliberately slow service, profile it, fix it, and show the numbers.
- **Why:** "it is slow" becomes a measurement instead of a guess.

### Week 7 — Idioms, design and API craft
Null safety, immutability, error modelling, the design patterns worth using, domain
modelling, API design, backwards compatibility, module and package design, code review.
- **Lab:** refactor a procedural codebase into a modular, immutable, well-typed domain
  with a documented public API.
- **Why:** the last mile between working code and good code.

### Projects
See `projects.md` — six builds from a CLI to a high-throughput service, plus a capstone.

---

## Environment setup (first hour)

```bash
# Get a JDK 25 (LTS) — Temurin, Zulu, or Oracle, all fine
java -version          # expect 25.x
javac -version

# Build tool (use the wrapper, never a system Maven)
mvn -v                 # or: gradle -v
```

```bash
mkdir java-path && cd java-path
# Start from a single class, not a framework. Java needs no scaffolding.
cat > Hello.java <<'EOF'
public class Hello {
    public static void main(String[] args) {
        System.out.println("Start here: " + java.time.LocalDate.now());
    }
}
EOF
java Hello.java         # single-file source launcher, JDK 11+
```

**Tools worth installing in week one:**

| Tool | Why |
| --- | --- |
| IntelliJ IDEA (Community) | The best Java debugger and refactorer available |
| `sdk` (SDKMAN!) | Switch JDK versions per project without uninstalling |
| JShell | `jshell` in a terminal — experiment with APIs in seconds |
| VisualVM or JFR Viewer | Read what your program is actually doing |

**Use JShell constantly.** It is the fastest way to answer "what does this API actually
return?" without writing a file, compiling, or running anything.

---

## Working rhythm

| Block | Time | What you do |
| --- | --- | --- |
| Read | 45 min | One module's concepts. Notes only. |
| Build | 2 h | The lab, from the spec. Compilable, tested. |
| Break | 30 min | Break it on purpose; read the actual stack trace. |
| Refactor | 30 min | Make it shorter and clearer. Measure the diff. |
| Commit | 15 min | With a message explaining *why*. |

**Rule:** your code must compile with **no warnings**. `-Xlint:all -Werror` in your build
turns style debt into a build failure, which is the only way it ever gets paid down.

---

## The habits that make you employable

1. **Prefer immutability.** `record` for data, `final` fields, no setters. Make illegal
   states unrepresentable.
2. **Constructor injection everywhere** — no field assignment after construction.
3. **Return types carry meaning.** Use `Optional<T>` deliberately, and understand exactly
   when *not* to.
4. **No raw types, no unchecked casts.** If you must cast, suppress with `@SuppressWarnings`
   and a comment explaining why it is safe.
5. **Test the behaviour, not the implementation.** A private method is tested through its
   public API.
6. **Read the stack trace.** All of it. The exception type, the message, and the frames.
   It is the fastest feedback loop you have.
7. **Know your bytecode target.** Set `--release 21` and never use an API newer than your
   declared target, or your build passes and production fails.

---

## How to use this platform

- The left rail is the curriculum, in order. Progress is stored in your browser.
- Every module ends with a **Lab**, **Deliverable**, and **Self-check**.
- The markdown in this folder is the source of truth — edit it, keep it as your notes.
