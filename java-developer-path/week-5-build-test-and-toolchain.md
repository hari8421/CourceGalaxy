---
title: "Week 5 — Build, Test & Toolchain"
track: "java"
week: 5
order: 5
type: "module"
hours: 16
summary: "Maven and Gradle, dependency management, JUnit 5, AssertJ, Mockito, Testcontainers, debugging, static analysis, and a real test pyramid."
tags: ["maven", "gradle", "junit5", "assertj", "mockito", "testcontainers", "debugging", "spotbugs", "tooling"]
---

# Week 5 — Build, Test & Toolchain

**Goal by Friday:** a multi-module project with a real test pyramid — fast unit tests,
slice tests, and Testcontainers integration tests against a real database — that builds
warning-free in CI.

**This is the module that separates code that works from code that can be changed safely.**

---

## 1. Concepts (3 h)

### 1.1 Maven — only what you need to know

```xml
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>orders</artifactId>
  <version>1.0.0</version>

  <properties>
    <maven.compiler.release>21</maven.compiler.release>   <!-- NOT source/target -->
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>5.11.0</version>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.5.2</version>
      </plugin>
    </plugins>
  </build>
</project>
```

**`<release>21` over `<source>`/`<target>`.** This is the setting that matters most and the
one people get wrong: `source`/`target` only check the *language level*, so you can
compile against APIs from a newer JDK and get an `NoSuchMethodError` in production.
**`release` also validates the API surface.** If you say 21, the compiler will refuse to
let you call a method that only exists in 25.

**The dependency rules:**

| Rule | Why |
| --- | --- |
| **Never specify a version for a managed dependency** | That is how CVE-ridden transitive trees start |
| **Never use `system` scope** | It breaks reproducibility and security |
| **Run `mvn dependency:tree` before adding anything** | Often you already have it transitively |
| **Spring Boot: use the parent or the BOM** | The parent manages versions for the whole ecosystem |

```bash
./mvnw clean verify           # compile + test + package
./mvnw -Dtest=OrderTest test  # one class
./mvnw -Dgroups=slow test     # a tagged subset
./mvnw -Pprod package         # a profile
./mvnw dependency:tree        # what is actually on my classpath
```

**Always use the wrapper** (`./mvnw`), committed to the repo. It pins the Maven version, so
every developer and CI runs the same one.

### 1.2 Gradle — worth knowing, not worth arguing about

```kotlin
plugins {
    java
    id("org.springframework.boot") version "3.5.0"
}

java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }

dependencies {
    testImplementation(platform("org.junit:junit-bom:5.11.0"))
    testImplementation("org.junit.jupiter:junit-jupiter")
}

tasks.test { useJUnitPlatform() }
```

**The one thing to know about Gradle:** the **build cache** and **configuration cache**.
A correct, incrementally-built Gradle build is dramatically faster than Maven on a large
project — which is why most new Java projects use it. The trade-off is a real learning
curve and a much larger error surface.

**Practical stance:** learn to *use* Gradle, understand dependency management and the
task graph, and let the team choose. Both are legitimate; a team that mixes both is the
actual problem.

### 1.3 JUnit 5 — the parts that matter

```java
class OrderServiceTest {

    private final OrderRepository repo = new InMemoryOrderRepository();
    private final OrderService service = new OrderService(repo, new PricingService(),
            () -> Instant.parse("2026-01-01T00:00:00Z"));   // injected clock = deterministic

    @Test
    @DisplayName("assigns sequential ids")
    void assignsSequentialIds() {
        assertThat(service.place("SKU-1", 1).id()).isEqualTo(1);
        assertThat(service.place("SKU-2", 1).id()).isEqualTo(2);
    }

    @Nested
    @DisplayName("when stock is insufficient")
    class InsufficientStock {

        @Test
        @DisplayName("rejects the order")
        void rejects() {
            assertThatThrownBy(() -> service.place("SKU-1", 99))
                    .isInstanceOf(InsufficientStockException.class)
                    .hasMessageContaining("SKU-1");
        }

        @BeforeEach
        void setUp() { repo.save(product("SKU-1", stock = 1)); }
    }
}
```

**`@Nested` classes are the most underused JUnit 5 feature.** They give you
`place → when stock is insufficient → rejects the order` naming, shared setup per
condition, and no giant single test class.

| Feature | Use it for |
| --- | --- |
| `@Nested` | Grouping by scenario, with per-group setup |
| `@ParameterizedTest` + `@CsvSource` | The same logic across many inputs |
| `@MethodSource` | Inputs generated by a method — great for edge cases |
| `@RepeatedTest` | Detecting flakiness from hidden state |
| `@Timeout` | Guarding against a hanging test |
| `@TestMethodOrder` | **Avoid** — it means your tests are not independent |
| `@Disabled` | Temporary only, with a reason and an issue link |

```java
@ParameterizedTest
@CsvSource({
        "'',            false",
        "'2026-13-01',  false",
        "'2026-02-30',  false",     // reject invalid dates
        "'2026-03-01',  true",
})
@DisplayName("validates ISO dates")
void validatesIsoDates(String input, boolean expected) {
    assertThat(validator.isValidDate(input)).isEqualTo(expected);
}

@ParameterizedTest
@MethodSource("edgeCaseAmounts")
void handlesEdgeCaseAmounts(BigDecimal amount) {
    assertThatNoException().isThrownBy(() -> new Money(amount, USD));
}

static Stream<BigDecimal> edgeCaseAmounts() {
    return Stream.of(BigDecimal.ZERO, new BigDecimal("0.01"),
            new BigDecimal("999999999.99"), new BigDecimal("1E+3"));
}
```

### 1.4 AssertJ — assertions you can read

```java
assertThat(result)
    .isNotNull()
    .extracting(Order::status, Order::total)
    .containsExactly(Status.SHIPPED, new BigDecimal("42.50"));

assertThat(list)
    .hasSize(3)
    .allSatisfy(o -> assertThat(o.total()).isPositive())
    .extracting(Order::id)
    .doesNotHaveDuplicates();

assertThatThrownBy(() -> service.place(id))
    .isInstanceOf(InsufficientStockException.class)
    .hasMessageContaining("SKU-1")
    .hasNoCause();               // or .hasCauseInstanceOf(...) when you care
```

**`assertThat` with a descriptive message, not `assertTrue(x != null)`.** When a test fails
at 2am, the assertion *is* your documentation.

### 1.5 Mocking — and its limits

```java
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock PaymentGateway gateway;
    @InjectMocks OrderService service;      // constructor injection -> clean wiring

    @Test
    void chargesOnConfirmation() {
        when(gateway.charge(anyString(), eq(4250))).thenReturn(Receipt.ok("tx-1"));

        var order = service.confirm("ORD-1");

        verify(gateway).charge("ORD-1", 4250);           // verify the interaction
        assertThat(order.status()).isEqualTo(Status.PAID);
    }

    @Test
    void doesNotChargeWhenAlreadyPaid() {
        var order = service.load("ORD-1").markPaid();
        service.confirm(order);
        verifyNoInteractions(gateway);                   // a real assertion, not a default
    }
}
```

**Where mocks are appropriate:** external services, the network, the clock, randomness.
**Where they are not:** your own domain logic. Mocking your own classes means testing
nothing but your assumptions.

**Three techniques worth knowing:**

```java
when(gateway.charge(any(), any())).thenReturn(Receipt.ok("1"))
                                   .thenReturn(Receipt.ok("2"));   // sequential returns
when(repo.findById(anyString())).thenAnswer(i -> Optional.of(order(i.getArgument(0))));
verify(gateway, times(3)).charge(any(), any());
verify(gateway, never()).refund(any(), any());
```

### 1.6 Testcontainers — integration tests that tell the truth

An in-memory database proves nothing about your real SQL. Testcontainers runs the real
thing.

```java
@SpringBootTest
@Testcontainers
class OrderRepositoryIT {

    @Container
    @ServiceConnection                     // Boot 3.1+: wires URL and credentials for you
    static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired OrderRepository repo;
    @Autowired JdbcTemplate jdbc;

    @Test
    void respectsThePartialUniqueIndex() {
        repo.save(order("ORD-1"));
        assertThatThrownBy(() -> repo.saveAndFlush(order("ORD-1")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void usesTheIndexWeDesigned() {
        var plan = explain("SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC");
        assertThat(plan).contains("Index Scan");        // not Seq Scan on a big table
    }
}
```

**Why this is worth the extra seconds:** the tests that only fail against real PostgreSQL
are collation behaviour, index usage, constraint names, timestamp precision, transaction
isolation, and `NULL` semantics. Every one of them has bitten a team that tested on H2.

### 1.7 Static analysis, and the build that fails on a warning

| Tool | Catches | Effort |
| --- | --- | --- |
| `-Xlint:all -Werror` | Compiler warnings | Free — do it today |
| **SpotBugs** | Null dereferences, resource leaks, bad locking | Low config, high value |
| **Error Prone** | Bugs the compiler misses, at compile time | Low config, some false positives |
| Checkstyle / PMD | Style and complexity rules | Low value; keep the config tiny |
| **JaCoCo** | Coverage, with a diff-aware gate | Low |

```xml
<plugin>
  <groupId>com.github.spotbugs</groupId>
  <artifactId>spotbugs-maven-plugin</artifactId>
  <version>4.9.3.0</version>
</plugin>

<!-- JaCoCo: fail the build if coverage DROPS, not for an absolute number -->
<rule>
  <element>BUNDLE</element>
  <limits>
    <limit>
      <counter>LINE</counter>
      <value>COVEREDRATIO</value>
      <minimum>0.70</minimum>
    </limit>
  </limits>
</rule>
```

**Coverage is a diagnostic, not a target.** 100 % coverage with no meaningful assertions is
worse than 60 % with good ones. Gate on *regression* — coverage must not go down — rather
than chasing a number.

### 1.8 Debugging like an adult

1. **Read the whole stack trace.** The exception type, the message, and *every* frame. The
   cause is usually at the bottom.
2. **Reproduce it in a test** before you fix it. A bug you cannot reproduce is a bug you
   cannot verify you fixed.
3. **Conditional breakpoints** in the IDE, and a watch expression for the state you care
   about.
4. **JFR for anything timing-related** — it is low overhead and runs in production.
5. **Learn to read a heap dump** — at least the dominator tree and one leak pattern.

---

## 2. Lab — a multi-module project (the week's main build)

```
parent/                    pom.xml, dependency management, plugin config
├── domain/                records, sealed types, domain exceptions — NO dependencies
├── service/               business logic, depends on domain
└── adapter-persistence/   Spring Data, Flyway, depends on domain
```

### 2.1 A real test pyramid

```java
// Layer 1 — pure unit, no Spring, milliseconds
class MoneyTest {
    @Test void refusesCurrencyMixing() { /* ... */ }
}

// Layer 2 — slice, one framework concern, sub-second
@DataJpaTest
class OrderRepositoryTest { /* real DB via Testcontainers, no service layer */ }

// Layer 3 — full integration, the slow ones, tagged
@SpringBootTest
@Tag("slow")
class CheckoutFlowIT { /* the whole wiring, real Postgres */ }
```

**The build must be honest about the cost:**

```xml
<plugin>
  <artifactId>maven-surefire-plugin</artifactId>
  <configuration>
    <groups>!slow</groups>          <!-- the default run skips integration tests -->
  </configuration>
  <executions>
    <execution>
      <id>integration</id>
      <phase>verify</phase>
      <goals><goal>integration-test</goal></goals>
      <configuration><groups>slow</groups></configuration>
    </execution>
  </executions>
</plugin>
```

### 2.2 Module boundaries, enforced

```java
// domain must not depend on anything — including the framework
@Test
void domainHasNoFrameworkDependencies() throws IOException {
    try (var files = Files.walk(Path.of("target/classes"))) {
        files.filter(f -> f.toString().endsWith(".class"))
             .forEach(f -> assertThat(readClassName(f))
                     .doesNotStartWith("org.springframework")
                     .doesNotStartWith("jakarta."));
    }
}
```

**An ArchUnit test is the better version of this** and takes five minutes:

```java
@Test
void servicesMustNotDependOnAdapters() {
    noClasses().that().resideInAPackage("..service..")
        .should().dependOnClassesThat().resideInAnyPackage("..adapter..", "org.springframework.web..")
        .check(new ClassFileImporter().importPackages("com.example"));
}
```

### 2.3 Measure the build

```bash
time ./mvnw clean verify
./mvnw -Dtest='*Test' test     # unit only
```

Record: unit suite time, integration suite time, and the total. **If your full test suite
is over two minutes, developers will start skipping it, and a skipped suite is a broken
safety net.** The fix is tagging and splitting, not patience.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Compile with `source/target` and call a newer API; then with `release` | The setting that prevents production failures |
| 2 | Break a test into `@Nested` groups | Readable failure names |
| 3 | Parameterise 5 tests into 1 | Table-driven tests |
| 4 | Find a real bug in a test suite by running it 20 times | Flakiness is usually shared state |
| 5 | Run SpotBugs; fix the top 3 findings | Static analysis finds real bugs |
| 6 | Time the suite; tag the slow tests | Making the fast path fast |
| 7 | Write an ArchUnit boundary test | Enforcing architecture, not documenting it |

---

## 4. Deliverable — the multi-module project

- [ ] Parent + 3 modules, with `mvnw` committed and `release` (not source/target) set
- [ ] A domain module with **zero** framework dependencies, and a test proving it
- [ ] Unit tests with no Spring context; slice tests; Testcontainers integration tests
- [ ] `@Nested` scenario grouping and ≥ 3 `@ParameterizedTest`s
- [ ] Slow tests tagged and excluded from the default run
- [ ] `mvn clean verify` green, SpotBugs clean, `-Xlint:all -Werror` enforced
- [ ] An ArchUnit test for the module boundaries
- [ ] A measured build time table, with a note on what you would move to a faster tier
- [ ] `README.md` with the build commands, the test strategy, and the timings

---

## 5. Self-check

1. What does `--release 21` catch that `source`/`target` does not?
2. When is a mock the wrong tool?
3. Why is an in-memory database worse than no test?
4. What is `@Nested` for, beyond organisation?
5. Your full suite takes 4 minutes. What happens to the team, and what do you do?
6. Name two bugs Testcontainers catches that H2 never will.

---

## 6. Cheat sheet

| Need | Use |
| --- | --- |
| Correct language + API level | `<release>` / `toolchain` |
| Deterministic tests | Inject `Clock` and `RandomGenerator` |
| Many inputs, one assertion | `@ParameterizedTest` + `@CsvSource` |
| Scenario grouping | `@Nested` |
| Readable assertions | AssertJ `assertThat` with extractors |
| External boundary | Mockito |
| Real database | Testcontainers + `@ServiceConnection` |
| Find latent bugs | SpotBugs, Error Prone, `-Xlint:all -Werror` |
| Enforce architecture | ArchUnit |
| Keep coverage honest | JaCoCo diff gate |
| Debug a timing issue | JFR, not `System.out` |
