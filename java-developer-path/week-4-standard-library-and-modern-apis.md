---
title: "Week 4 — The Modern Standard Library"
track: "java"
week: 4
order: 4
type: "module"
hours: 16
summary: "java.time, NIO and modern I/O, the HTTP client, text processing, RandomGenerator, and the FFM API for off-heap memory."
tags: ["java-time", "nio", "http-client", "regex", "records", "ffm", "streams-io"]
---

# Week 4 — The Modern Standard Library

**Goal by Friday:** a file-processing pipeline using NIO, virtual threads and structured
concurrency, with a `java.time`-correct domain model and zero deprecated API calls.

**This is where "I don't know Java well" usually turns out to be a standard-library gap.**

---

## 1. Concepts (3 h)

### 1.1 `java.time` — the only correct way to handle dates

```java
LocalDate.of(2026, 3, 14);                    // date, no time, no zone
LocalDateTime.of(2026, 3, 14, 9, 30);         // date+time, no zone
Instant.now();                                // a moment on the timeline (UTC internally)
ZonedDateTime.now(ZoneId.of("Europe/London"));
OffsetDateTime.parse("2026-03-14T09:30:00+01:00");
Duration.between(start, end);                 // PT2H15M
Period.between(birth, today);                 // P29Y2M
YearMonth.of(2026, 3);
DayOfWeek.MONDAY.getDisplayName(TextStyle.FULL, Locale.UK);
```

**The five types and when each is right — get this wrong and you have a bug:**

| Type | Means | Use for |
| --- | --- | --- |
| `LocalDate` | A calendar date | Birthdays, invoice dates, "the 1st of the month" |
| `LocalDateTime` | Date + time, **no zone** | "The 9:30am workshop" — a wall-clock time |
| `Instant` | An exact point on the timeline | Events, logs, ordering, machine timestamps |
| `ZonedDateTime` | Date + time + **region** | "The 9:30am workshop in London" — DST aware |
| `OffsetDateTime` | Date + time + **offset** | Serialisation, where the region name does not matter |

**The classic bug:** using `LocalDateTime` for a scheduled event. It has no zone, so on the
day the clocks change, the event fires an hour early or late. Store the `ZonedDateTime`.

```java
// The three methods you will actually use
Duration d = Duration.between(a, b);
d.toMinutes(); d.toHours(); d.isNegative();

Period p = Period.between(from, to);
p.getYears(); p.getMonths(); p.toTotalMonths();

LocalDate nextBilling = today.plusMonths(1).withDayOfMonth(1);
```

**Daylight saving, honestly:** `ZonedDateTime` handles the gaps and overlaps by shifting
forward — but there are local times that do not exist on a DST transition day, and
`LocalDate.atStartOfDay(zone)` resolves them. If your business cares about "2:30am on the
DST day", you have a product problem, not a Java one.

```java
// Serialisation: use ISO-8601 and be explicit about the type
String json = objectMapper.writeValueAsString(Map.of(
    "at",      Instant.now().toString(),              // 2026-03-14T09:30:00Z
    "due",     LocalDate.now().plusDays(7).toString() // 2026-03-21
));
```

### 1.2 NIO.2 — files, paths and streams that actually perform

```java
Path dir = Path.of("/var/log/app");
Files.list(dir)                                    // Stream<Path>, lazy
     .filter(p -> p.toString().endsWith(".log"))
     .forEach(this::archive);

Files.walk(dir)                                    // recursive, depth-first
     .filter(Files::isRegularFile)
     .forEach(this::index);

try (var lines = Files.lines(Path.of("access.log"))) {   // closes the file
    lines.filter(l -> l.contains(" 500 ")).count();
}
```

**`Files` methods worth memorising:** `readString`, `writeString`, `lines` (stream),
`list` (stream), `walk` (stream), `createTempFile`, `createDirectories`,
`deleteIfExists`, `move` with `ATOMIC_MOVE`, and `size`.

**Resource management: `try-with-resources`, always.**

```java
// The file handle is closed even if the body throws, and in the right order
try (var reader = Files.newBufferedReader(path);
     var writer = Files.newBufferedWriter(out)) {
    reader.transferTo(writer);
}
```

Suppressed exceptions are a quiet benefit: if both `close()` and the body throw, the first
is attached to the second rather than lost. Your IDE will generate this for you —
**accept the suggestion, always.**

### 1.3 The modern HTTP client

```java
// java.net.http.HttpClient, since Java 11. Replaces HttpURLConnection.
try (var client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build()) {

    var request = HttpRequest.newBuilder(URI.create("https://api.example.com/orders/" + id))
        .header("Accept", "application/json")
        .timeout(Duration.ofSeconds(10))              // per-request, distinct from connect
        .GET()
        .build();

    HttpResponse<String> response =
            client.send(request, HttpResponse.BodyHandlers.ofString());

    if (response.statusCode() == 200) return parse(response.body());
    if (response.statusCode() == 429) retryLater(response);   // handle it explicitly
    throw new UpstreamException(response.statusCode());
}
```

**Blocking `send` is fine on a virtual thread** — that is the entire reason virtual threads
make the modern client usable. For thousands of concurrent calls:

```java
var response = client.sendAsync(request, BodyHandlers.ofString())
                       .orTimeout(10, TimeUnit.SECONDS)
                       .join();
```

**Two rules:** set a **connect** timeout and a **request** timeout (they are different
things), and always handle 429 and 5xx deliberately rather than by exception.

### 1.4 Text processing and regular expressions

```java
// Named groups turn a regex into readable code
Pattern ORDER_REF = Pattern.compile(
        "ORD-(?<year>\\d{4})-(?<seq>\\d{6})", Pattern.CASE_INSENSITIVE);

Matcher m = ORDER_REF.matcher("see ord-2026-000123 for details");
if (m.matches()) {
    int year = Integer.parseInt(m.group("year"));
    long seq  = Long.parseLong(m.group("seq"));
}
```

**The performance trap that catches everyone:** `String.matches` and `String.replaceAll`
**recompile the pattern on every call**. In a loop over a million rows that is the
difference between milliseconds and minutes.

```java
// Slow: recompiles
for (String line : lines) if (line.matches("ORD-\\d{4}-\\d{6}")) { ... }

// Fast: compiled once
for (String line : lines) if (ORDER_REF.matcher(line).matches()) { ... }
```

**Also worth knowing:** `Matcher.find()` for substring search versus `matches()` for the
whole input; possessive quantifiers and atomic groups when you are fighting catastrophic
backtracking; and `\\Q...\\E` to quote a literal.

### 1.5 Modern randomness, and the interfaces you should code against

```java
RandomGenerator random = RandomGenerator.of("L64X128MixRandom");   // Splittable + jumpable
random.nextInt(bound);
SecureRandom secure = SecureRandom.getInstanceStrong();           // for anything security-related

// In tests, ALWAYS make randomness injectable — this is the single biggest source of
// flaky tests in Java codebases.
static String generateToken(RandomGenerator rng) {
    return rng.nextLong(Long.toUnsignedString(rng.nextLong(), 36));
}
```

`Math.random()` is not thread-safe in older usage patterns and is not reproducible. Never
use it in code you want to test.

### 1.6 Sequenced collections (21) and other odds and ends

```java
// Ordered and deduplicated views, added in 21
SequencedSet<String> names = new LinkedHashSet<>();
names.addFirst("alpha");
names.reversed();

// Useful things people still do by hand
List.of("b", "a", "c").stream().collect(toCollection(ArrayList::new));   // mutable copy
Stream.of(1, 2, 3).mapToObj(i -> "n" + i).toList(LinkedHashMap::new, (m, s) -> ...);
Map.of("a", 1, "b", 2).entrySet().stream().sorted(Map.Entry.comparingByValue());
```

```java
// Method references: read them left to right as "what is being called on what"
orders.stream().map(Order::total)          // static-ish: Order::total
orders.forEach(System.out::println)       // instance: the receiver is the element
inventory.values().stream().map(Stock::sku)
Optional.ofNullable(cfg).map(Config::timeout)
```

**Read `Class::method` as "call `method` on each `Class`".** Once you read them that way
they stop being cryptic and start being shorter than the lambda.

### 1.7 The FFM API (preview) — memory outside the heap

The **Foreign Function & Memory API** gives safe, fast access to memory the JVM does not
manage, replacing `sun.misc.Unsafe` and the need for JNI in many cases.

```java
// Preview API: --enable-preview, and it has changed across releases. Learn the shape.
try (Arena arena = Arena.ofConfined()) {
    MemorySegment segment = arena.allocateUtf8String("hello from off-heap");
    MemorySegment copy = arena.allocate(segment.byteSize());
    MemorySegment.copy(segment, 0, copy, 0, segment.byteSize());
}
```

**Why you would care:** high-throughput parsing, native interop, and reducing GC pressure
for large buffers. **Why you probably do not need it yet:** it is a preview API, and the
garbage collector already does well. Know that it exists and what problem it solves.

---

## 2. Lab — a file-processing pipeline (the week's main build)

**Spec:** process a directory of 10,000 JSON log files, extract errors, aggregate, and
write a report. No frameworks.

### 2.1 The domain model with correct time types

```java
public record LogEntry(
        Instant at,                  // a moment: always Instant for machine events
        String level,                // ERROR | WARN | INFO
        String service,
        String message,
        Map<String, String> context
) {
    public static LogEntry parse(String line) {
        int firstSpace = line.indexOf(' ');
        var at = Instant.parse(line.substring(0, firstSpace));   // ISO-8601, strict
        // ... remaining fields
    }
}
```

**Note the choice of `Instant` for `at`.** A log line is a machine event, not a wall-clock
appointment, so `Instant` is correct. Had this been a scheduled job, it would be a
`ZonedDateTime`. **Being able to explain that choice is the deliverable.**

### 2.2 The pipeline, bounded

```java
public record Report(int processed, Map<String, Long> errorsByService,
                     Map<String, Long> errorsByHour, Instant generatedAt,
                     Duration elapsed) {}

public static Report process(Path dir) throws Exception {
    Instant start = Instant.now();
    Semaphore permits = new Semaphore(16);           // bound the concurrency

    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
        var files = Files.list(dir).filter(p -> p.toString().endsWith(".json")).toList();

        var futures = files.stream().map(path -> executor.submit(() -> {
            permits.acquire();
            try { return readEntries(path); }          // I/O — blocks, which is fine here
            finally { permits.release(); }
        })).toList();

        List<LogEntry> all = new ArrayList<>();
        for (var f : futures) all.addAll(f.join());
        return aggregate(all, start);
    }
}

private static List<LogEntry> readEntries(Path path) throws IOException {
    try (var lines = Files.lines(path)) {
        return lines.map(LogEntry::parse).toList();    // try-with-resources closes the file
    }
}

private static Report aggregate(List<LogEntry> entries, Instant start) {
    var byService = entries.stream()
            .filter(e -> e.level().equals("ERROR"))
            .collect(groupingBy(LogEntry::service, counting()));

    var byHour = entries.stream()
            .filter(e -> e.level().equals("ERROR"))
            .collect(groupingBy(
                    e -> e.at().truncatedTo(ChronoUnit.HOURS),   // java.time grouping
                    TreeMap::new,                                  // sorted output
                    counting()));

    return new Report(entries.size(), byService, byHour,
                      Instant.now(), Duration.between(start, Instant.now()));
}
```

**The four things to point at in a review:**

1. `Files.lines` inside try-with-resources — **the file handle is closed**.
2. `Semaphore(16)` — the bound that makes virtual threads safe against the filesystem.
3. `TreeMap::new` in `groupingBy` — deterministic output order, so diffs are meaningful.
4. `Instant` for both the event and the duration — **no `LocalDateTime` anywhere**.

### 2.3 The regex, compiled once

```java
private static final Pattern ERROR_LINE =
        Pattern.compile("^(?<ts>\\S+)\\s+ERROR\\s+\\[(?<service>[\\w-]+)\\]\\s+(?<msg>.+)$");

private static List<LogEntry> readEntries(Path path) throws IOException {
    try (var lines = Files.lines(path)) {
        return lines.map(ERROR_LINE::matcher)
                    .filter(Matcher::matches)
                    .map(m -> new LogEntry(
                            Instant.parse(m.group("ts")),
                            "ERROR",
                            m.group("service"),
                            m.group("msg"),
                            Map.of()))
                    .toList();
    }
}
```

### 2.4 Prove the resource handling

```java
@Test
void closesEveryFileHandle() throws Exception {
    // On Linux, count open descriptors before and after
    long before = openFileDescriptors();
    for (int i = 0; i < 5; i++) process(tempDir);
    assertThat(openFileDescriptors() - before).isLessThan(5);
}

@Test
void cleansUpWhenParsingFails() throws Exception {
    writeFile(tempDir.resolve("bad.json"), "this is not a log line at all");
    assertThatThrownBy(() -> process(tempDir))
            .isInstanceOf(DateTimeParseException.class);

    // the executor's resources must still have been released
    assertThat(openFileDescriptors() - before).isLessThan(5);
}
```

That second test is the one that catches the real bug: a failure path that leaks a handle.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | `LocalDateTime` for a recurring meeting across a DST boundary | Which time type is correct |
| 2 | `String.matches` in a loop vs a compiled `Pattern` | Benchmark it |
| 3 | Open 100 files without try-with-resources; count the descriptors | The leak you cannot see |
| 4 | `HttpClient` with only a connect timeout | Two different timeouts |
| 5 | `Math.random()` in a service method, then test it | Injectable randomness |
| 6 | Parse an `Instant` from a local-time string and be explicit about it | Serialisation types |
| 7 | Write a `method reference` and read it aloud as "call X on each Y" | Syntax fluency |

---

## 4. Deliverable — the file pipeline

- [ ] Correct time types throughout, with a written justification for each field
- [ ] NIO streaming (`Files.lines`/`walk`), never `readAllBytes` on a large file
- [ ] `try-with-resources` everywhere, plus a test that proves descriptors are released
- [ ] Compiled `Pattern` reused, with a benchmark showing why
- [ ] `HttpClient` integration with separate connect and request timeouts
- [ ] Virtual threads with a `Semaphore` bound
- [ ] Deterministic output (sorted maps) so runs are diffable
- [ ] A failure-path test proving resources are released on exceptions
- [ ] README with the measured throughput and a note on what you would change at 100×

---

## 5. Self-check

1. `LocalDate`, `LocalDateTime`, `Instant`, `ZonedDateTime` — when is each correct?
2. Why is `Instant` wrong for a recurring 9am meeting?
3. What is the hidden cost of `String.matches` inside a loop?
4. What is the difference between a connect timeout and a request timeout?
5. How do you know `try-with-resources` is doing anything?
6. Why does `Files.lines` inside try-with-resources matter more than it looks?

---

## 6. Cheat sheet

| Need | Use |
| --- | --- |
| A calendar date | `LocalDate` |
| A moment in time (events, logs) | `Instant` |
| A scheduled local event | `ZonedDateTime` |
| A gap between two instants | `Duration` |
| A gap between two dates | `Period` |
| Stream a file's lines | `Files.lines` in try-with-resources |
| Recursive traversal | `Files.walk` |
| HTTP call | `HttpClient` (11+) with both timeouts |
| Regex in a hot loop | Precompiled `Pattern` |
| Reproducible tests | Inject a `RandomGenerator` |
| Concurrency bound | `Semaphore` |
| Per-request context | `ScopedValue` |
