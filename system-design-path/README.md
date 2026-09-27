---
title: "System Design — Start Here"
track: "system"
week: 0
order: 0
type: "overview"
hours: 2
summary: "A 6-week path from 'I can build a service' to 'I can design a system that survives 100x, a region failure, and a cost review'."
tags: ["system-design", "architecture", "scalability", "interview", "distributed-systems"]
---

# System Design — Start Here

**Who this is for.** A developer who can build a working feature and now needs to be the
person who decides *how* it should work when it is a hundred times bigger, fails in a
region, or has to be explained to a finance team.

**What system design actually is.** Not architecture diagrams. It is **making and defending
trade-offs under constraints you do not control** — traffic you did not choose, hardware
that fails, data you cannot lose, and a budget that is real. Every topic in this path
exists because ignoring it has a known failure mode.

**Time commitment.** ~6 weeks at 10–14 focused hours per week. Most people already know
parts of this from shipping software; the path is about making the decisions **explicit and
defensible**, which is what interviews and design reviews actually test.

---

## The one framework

Every system design interview, and every real design review, runs the same loop. Learn it
once, use it everywhere:

| Step | Question | Time in a 45-min interview |
| --- | --- | --- |
| **1. Requirements** | What does it do, for whom, and what is explicitly *out* of scope? | 5 min |
| **2. Scale** | How many users, requests, and bytes? Do the math out loud. | 5 min |
| **3. API + data model** | The contract and the shape of the data. | 10 min |
| **4. High-level architecture** | The boxes and the arrows, and *why* those boxes. | 10 min |
| **5. Deep dive** | Pick the two hardest parts. Drive into the trade-offs. | 10 min |
| **6. Failure + operations** | What breaks, what do you measure, what do you do at 3am? | 5 min |

**The mistake almost everyone makes:** jumping to step 4 and drawing boxes. Requirements and
estimation are not filler — they are what let you justify every later decision. A design
with no numbers is a design with no trade-offs.

---

## The vocabulary that makes the rest obvious

Learn these and most design questions become retrieval, not invention.

| Layer | Concepts |
| --- | --- |
| **Compute** | Vertical vs horizontal scaling, stateless services, autoscaling, load balancers, serverless |
| **Data** | Relational modelling, indexes, sharding, replication, leader-follower, partitioning, blobs vs RDBMS |
| **Consistency** | Strong, eventual, read-your-writes, monotonic reads; isolation levels; CAP, PACELC |
| **Caching** | Cache-aside, read-through, write-through, write-behind, TTL, invalidation, stampede |
| **Messaging** | Queues, topics, ordering, at-least-once vs exactly-once, DLQs, backpressure |
| **Reliability** | SLOs, error budgets, timeouts, retries with jitter, circuit breakers, bulkheads, load shedding |
| **Distributed patterns** | Event sourcing, CQRS, saga, outbox, idempotency keys, anti-corruption layer, sidecars |
| **Operations** | Observability, tracing, capacity planning, cost engineering, chaos testing, incident response |
| **Security** | Authn/authz, multi-tenancy, ABAC, defence in depth, secrets, compliance boundaries |

---

## The 6-week map

### Week 1 — Requirements, estimation and the design loop
Back-of-the-envelope math, the latency numbers you must know cold, defining NFRs, writing a
design document, and how to run the 45-minute interview.
- **Lab:** a written design doc for a URL shortener, with real numbers throughout.
- **Why first:** estimation is the single highest-leverage skill and the one most people
  skip.

### Week 2 — Data: storage, consistency and transactions
Relational modelling and indexing, storage engines, sharding and partitioning, replication,
consistency models, isolation levels, idempotency, the outbox and saga patterns.
- **Lab:** a sharding + replication plan for a write-heavy table, with a failure drill.
- **Why:** data decisions are the hardest to reverse, so they get the deepest treatment.

### Week 3 — Scaling out: compute, caching and messaging
Load balancers, stateless services, autoscaling, CDN and DNS, caching layers and
invalidation, queues, backpressure, rate limiting, load shedding, event-driven architecture.
- **Lab:** a cache layer with stampede protection, plus a queue that survives a consumer crash.
- **Why:** this is the module that turns "it works" into "it handles load".

### Week 4 — Reliability, observability and cost
SLIs/SLOs and error budgets, failure modes and how to contain them, distributed tracing,
capacity planning, cost engineering, multi-region and disaster recovery, security boundaries.
- **Lab:** an SLO dashboard definition, an error-budget policy, and a chaos experiment.
- **Why:** the difference between an engineer and a senior engineer.

### Week 5 — The interview playbook
The 12 canonical problems, the pattern catalogue that answers them, how to handle
"scale this to a million users", whiteboarding, and what interviewers actually score.
- **Lab:** three timed 45-minute designs with a peer or a recording.
- **Why:** interview performance is a separate skill from design ability, and it is
  trainable.

### Projects
See `projects.md` — ten canonical builds from URL shortener to ride-sharing dispatch, each
with the specific mechanism you must implement.

---

## Prerequisites

You should be comfortable with:
- [ ] One backend language and building a REST API
- [ ] SQL: joins, indexes, transactions
- [ ] How HTTP works
- [ ] Reading a stack trace

You do **not** need distributed-systems theory. You do not need to have operated a
production cluster. You do need to be willing to do arithmetic out loud, because that is
what the interview is measuring.

---

## The five numbers worth memorising

| Operation | Typical latency |
| --- | --- |
| L1 cache read | ~1 ns |
| RAM read | ~100 ns |
| SSD random read | ~100 µs (0.1 ms) |
| HDD random read | ~10 ms |
| Same-datacentre RTT | ~0.5 ms |
| Cross-continent RTT | ~50–100 ms |

These are order-of-magnitude, and that is the point: **10 memory reads ≈ 1 SSD read ≈ 100
cross-continent round trips.** Almost every performance design decision follows from that
one comparison — put it in the chat, not the database; batch the network calls; cache what
you can.

> ⚠️ These are engineering rules of thumb, not guarantees. Benchmark on your own hardware.
> Interviewers care that you reason in orders of magnitude, not that you memorise numbers.

---

## Working rhythm

| Block | Time | What you do |
| --- | --- | --- |
| Read | 45 min | One module's concepts. Notes only. |
| Design | 90 min | Write a design doc from a spec. No code. |
| Build | 2 h | Implement the one mechanism that doc depends on. |
| Break | 30 min | Kill a dependency mid-run. Read what the system does. |
| Say it aloud | 30 min | Explain your design to a person or a recording, in 20 minutes. |

**Rule that matters more here than anywhere:** *you cannot debug a system you cannot
explain, and you cannot explain a system you have never defended.* The "say it aloud"
block is the one people skip and the one that changes the most.

---

## The metric you are optimising for

At the end you should be able to sit down with an unfamiliar problem and, unprompted:

1. Ask the scope and constraints questions
2. Estimate the scale with arithmetic
3. Draw a high-level architecture and **name why each box exists**
4. Drive into the two hardest parts and name the trade-offs you rejected
5. Explain how it fails and what you would watch at 3am

That is a 45-minute interview. It is also a design review. Same skill.
