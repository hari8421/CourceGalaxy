---
title: "Spring Boot Developer — Start Here"
track: "spring"
week: 0
order: 0
type: "overview"
hours: 2
summary: "A zero-to-production Java Spring Boot roadmap: language, framework, web and data, testing and security, then production engineering."
tags: ["java", "spring-boot", "maven", "roadmap", "career"]
---

# Spring Boot Developer — Start Here

**Who this is for.** Somebody who wants to build real backends with Java and Spring Boot —
either new to the stack or coming from another language and tired of framework archaeology.

**The target role.** A Spring Boot developer designs and ships **server-side Java services**:
REST APIs, persistence, transactions, security, testing, and deployments. Spring Boot's whole
value proposition is that it removes configuration so you can spend your time on that
business logic.

**Time commitment.** ~5 weeks at **12–15 focused hours per week** for someone new to Java;
~3 weeks if you already write Java daily.

---

## The version matrix (get this right on day one)

| Component | Version | Why |
| --- | --- | --- |
| JDK | **21 (LTS)** | Records, sealed types, pattern matching, virtual threads. |
| Spring Boot | **3.5.x** | Requires JDK 17+. Spring Boot 2.x is end-of-life for new work. |
| Maven | 3.9+ | Or Gradle 8.x. Pick one; Maven is more common in enterprise Java. |
| Database | PostgreSQL 16 | Learn one properly. MySQL is a checkbox difference. |
| Tooling | IntelliJ IDEA / VS Code, Docker, `curl`/HTTPie | — |

> ⚠️ The single most common beginner mistake is copying a `javax.*` tutorial into a Spring
> Boot 3 project. Boot 3 = **Jakarta EE** (`jakarta.persistence.*`), not `javax.*`.

---

## The 5-week map

### Week 1 — Java that you actually need
OOP, collections, generics, streams, exceptions, records, `Optional`, and the JVM/toolchain
enough to debug.
- **Lab:** a dependency-free **task tracker CLI** with a JSON file store, stream-based
  filtering, and a JUnit test suite.
- **Why first:** Spring hides the language, not the language. Weak Java makes Spring feel
  like magic; strong Java makes it feel obvious.

### Week 2 — Spring Boot fundamentals
Auto-configuration, IoC/DI, beans, stereotypes, constructor injection, configuration
properties, profiles, the application lifecycle.
- **Lab:** a **library/inventory service** with layered packages, DTOs, constructor
  injection everywhere, and profile-based config.
- **Why:** this is the conceptual core. Everything else is a module on top of it.

### Week 3 — Web APIs and persistence
Spring MVC, REST conventions, Bean Validation, error handling, Spring Data JPA,
Hibernate, transactions, Flyway, and the N+1 problem.
- **Lab:** a **CRUD + search API** for the library service with pagination, filtering,
  validation, and a Flyway-managed schema.
- **Why:** this is the actual job description of a Spring Boot developer.

### Week 4 — Testing, security, and production concerns
Testcontainers, `@WebMvcTest`/`@DataJpaTest`, Spring Security, JWT/OAuth2 resource server,
actuator, caching, async, scheduling, structured logging.
- **Lab:** secure the API with JWT + roles, and put an integration test suite on a real
  PostgreSQL container.
- **Why:** most junior Spring code is untested and unauthenticated. This week is the
  difference between a toy and a job.

### Week 5 — Production engineering
Docker, multi-stage builds, CI, performance and JVM tuning, resilience, messaging,
microservice boundaries, observability.
- **Lab:** containerise, add a CI pipeline that runs tests and builds the image, add metrics
  and health checks, and load-test it.
- **Why:** shipping is part of the job.

### Capstone
One full system: secured REST API, database, tests, container, CI, docs. See `projects.md`.

---

## Project ladder

| # | Project | When | Teaches |
| --- | --- | --- | --- |
| 1 | `task-tracker-cli` | Week 1 | Java, collections, streams, JUnit, JSON |
| 2 | `library-service` | Week 2–3 | Spring Boot, REST, JPA, Flyway, validation |
| 3 | `secure-notes-api` | Week 4 | Security, JWT, roles, Testcontainers |
| 4 | `bookstore-microservices` | Week 5 | Boundaries, messaging, resilience, Docker |
| 5 | **Capstone: `taskflow-api`** | End | Everything, production-grade |

---

## Environment setup (first hour)

```bash
# JDK 21 — check with: java -version
# Maven — check with: mvn -v

mkdir spring-boot-path && cd spring-boot-path
curl https://start.spring.io/starter.zip \
  -d bootVersion=3.5.0 -d javaVersion=21 -d type=maven-project \
  -d dependencies=web,data-jpa,validation,security,postgresql,flyway,actuator,lombok \
  -d groupId=com.example -d artifactId=library-service -d name=library-service \
  -o library-service.zip && unzip library-service.zip
```

`start.spring.io` is the single best tool in the Spring ecosystem: it generates a correct
`pom.xml` for exactly the dependencies you need, with the right versions managed. Use it for
every new project instead of copying a `pom.xml` from a tutorial.

Then:

```bash
cd library-service && ./mvnw spring-boot:run
curl http://localhost:8080/actuator/health
```

If that returns `{"status":"UP"}`, your environment is ready.

---

## Learning rhythm

| Block | Time | What you do |
| --- | --- | --- |
| **Read** | 45 min | Concepts section. Notes only. |
| **Build** | 2 h | The lab, no tutorial-following beyond the spec. |
| **Break** | 30 min | Delete a bean, break a migration, print a stack trace and read it line by line. |
| **Test** | 45 min | A test that would have caught the bug you just caused. |
| **Commit** | 15 min | With a message that says *why*. |

**Rule:** read stack traces. Spring errors are verbose and usually name the exact missing
bean. A developer who reads the full stack trace is 5× faster than one who Googles the first
line.

---

## The habits that make you employable

1. **Constructor injection, always.** No `@Autowired` on fields. It makes your classes
   testable with `new` and impossible to construct half-wired.
2. **Never let entities escape the web layer.** DTOs in, DTOs out. Otherwise you ship your
   database schema to the internet.
3. **Every config value in `application.yml` with a typed `@ConfigurationProperties` class.**
   No magic strings, no `System.out.println` for config.
4. **Testcontainers for integration tests.** An in-memory database proves nothing about your
   real SQL.
5. **Actuator + Micrometer from day one.** Metrics you add during an incident are fiction.
6. **Read the Spring reference** — it is genuinely excellent, and it will save you months.

---

## How to use this platform

- The left rail is the curriculum, in order. Progress is stored in your browser.
- Every module ends with a **Lab**, **Deliverable**, and **Self-check**.
- The markdown in this folder is the source of truth — edit it freely, it is your notes too.
