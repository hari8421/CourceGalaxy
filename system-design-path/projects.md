---
title: "Projects & Capstone"
track: "system"
week: 5
order: 6
type: "project"
hours: 16
summary: "Ten canonical builds plus one capstone that forces every pattern in the catalogue to earn its place."
tags: ["projects", "capstone", "portfolio", "interview"]
---

# Projects & Capstone

You learn system design by building the mechanisms and watching them fail under load. Each
project below names the **one pattern it exists to teach**, so you can skip the ones you
already know and go deep on the ones you do not.

---

## Project 1 — URL shortener (Week 1)
**Teaches:** estimation, key generation, cache-aside, hot-key protection.

- [ ] Three short-code strategies compared and one chosen with reasoning
- [ ] `POST /urls` + `GET /{code}` with a 307 redirect
- [ ] Cache-aside with jittered TTL and single-flight
- [ ] Hot-key bypass for a viral code
- [ ] Load test: report throughput, p50/p95/p99, cache hit ratio

---

## Project 2 — Rate limiter (Week 3)
**Teaches:** token bucket, distributed state, fairness per tenant.

- [ ] Token bucket with configurable rate and burst
- [ ] Per-client **and** per-tenant limits, `429` with `Retry-After`
- [ ] Distributed version using a shared store, with a documented eventual-consistency gap
- [ ] Load test proving the limit holds under concurrency
- [ ] A write-up: why not a fixed window, and what the burst problem is

---

## Project 3 — News feed (Week 5)
**Teaches:** fan-out on write vs fan-in on read, the hybrid celebrity problem.

- [ ] Feed generation with pagination that does not drift
- [ ] Fan-out-on-read and fan-out-on-write, both implemented and benchmarked
- [ ] Hybrid: popular authors fanned out, the rest on read
- [ ] Documented staleness bound per strategy

---

## Project 4 — Chat service (Week 3)
**Teaches:** ordering, partitions, WebSockets, delivery guarantees.

- [ ] WebSocket connection handling with heartbeat and reconnect
- [ ] Messages partitioned by conversation id → **ordering within a partition**
- [ ] At-least-once delivery with a client-side dedupe on message id
- [ ] Presence, with an explicit documented accuracy trade-off
- [ ] A written statement of exactly which guarantees you do and do not provide

---

## Project 5 — File storage (Week 5)
**Teaches:** chunking, content-addressed dedup, CDN, signed URLs.

- [ ] Chunked upload with resumable sessions
- [ ] Dedup by content hash; prove the second upload stores no new bytes
- [ ] Metadata in a relational DB, bytes in object storage
- [ ] Signed, expiring download URLs
- [ ] Public files served entirely from a CDN with the origin unreachable in a test

---

## Project 6 — Ticket booking (Week 2) ← *the consistency one*
**Teaches:** the reservation saga, expiring holds, and why 2PC is wrong here.

- [ ] Seat inventory with a **hold** that expires after N minutes
- [ ] A saga: hold → payment → confirm, with compensations on each failure
- [ ] **No double-booking**, proven by a concurrency test hammering the last seat
- [ ] Payment failures release the hold; abandoned holds expire
- [ ] A written analysis of what happens if the payment provider succeeds and confirm fails

---

## Project 7 — Analytics pipeline (Week 5)
**Teaches:** late arrivals, dedup, rollups, a separate write path.

- [ ] Event ingest → queue → batch workers → a columnar/analytical store
- [ ] Client-generated event ids for dedup
- [ ] Handle late and out-of-order events; recompute affected windows
- [ ] Hourly and daily rollups so a dashboard query does not scan a year
- [ ] A dashboard query plan proving the rollups are used

---

## Project 8 — Notification system (Week 4)
**Teaches:** priority queues, per-channel workers, DLQ, deduplication, SLOs.

- [ ] Priority queue; low-priority work yields to high-priority work
- [ ] Per-channel workers (email, SMS, push) with independent scaling and rate limits
- [ ] Retry with capped jittered backoff, then DLQ
- [ ] User preferences and quiet hours
- [ ] SLIs per channel and a documented error-budget policy

---

## Project 9 — Video transcoding pipeline (Week 5)
**Teaches:** job DAGs, fan-out, storage tiers, idempotent workers.

- [ ] Upload triggers a DAG: probe → transcode ladder → thumbnails → publish
- [ ] Fan-out across workers with a queue per stage
- [ ] Each stage idempotent, so a worker crash and restart does not duplicate work
- [ ] Storage tiering: originals cold, derivatives hot
- [ ] Progress tracking and a failure report per stage

---

## Project 10 — Payment system (Week 2) ← *the hardest one*
**Teaches:** a ledger, idempotency, reconciliation, saga across providers.

- [ ] Double-entry ledger — every transaction is balanced or it is rejected
- [ ] Idempotency keys on every mutating endpoint
- [ ] Saga with compensations across auth, capture, and fulfilment
- [ ] **Nightly reconciliation** against the provider, with a report of discrepancies
- [ ] A test that fires the same request 10 times and asserts one charge

---

## Capstone — a system of your own

Pick a domain you understand from the inside (a marketplace, a booking system, a
collaboration tool, a delivery app) and design *and build* it to production standards.

**Required:**

- [ ] A full design document: requirements, estimates, API, data model, architecture, two
      deep dives, failure modes, metrics, open questions
- [ ] Every pattern in the catalogue that *applies* — and a written justification for every
      one that does not
- [ ] A consistency table: every feature, its promise, and the mechanism that enforces it
- [ ] A cache layer, a queue, and a rate limiter — each with a test that proves its
      behaviour under failure
- [ ] Idempotency on every mutating endpoint
- [ ] SLIs, SLOs, an error-budget policy, and a dashboard definition
- [ ] A chaos experiment with recorded results
- [ ] A load test report and a cost model
- [ ] A multi-region or DR decision, written down with reasoning
- [ ] A threat model covering tenant isolation and secrets

**Definition of done:**

- [ ] A 45-minute walkthrough of the system, recorded, that you would be happy to defend
- [ ] You can answer "why not X?" for every architectural choice
- [ ] You can name the three things you would change first, and why
- [ ] It is on GitHub with a README containing the design doc and the real numbers

---

## Portfolio polish (1 h)

1. **One line with a number:** *"Booking service, 5k peak rps, 99.95 % availability over 90
   days, zero double-bookings in a 10k-concurrent last-seat test."*
2. **ASCII architecture**, 10 lines, with the trade-off for each box inline.
3. **The numbers table** — throughput, percentiles, cost, and the SLO you actually hit.
4. **One chart that tells the story** — latency before/after the fix that mattered.
5. **"What I'd do next"** — three items, in priority order.
6. **A link to the design doc**, because that is the artefact being reviewed.

---

## The 30-minute project deep-dive (STAR)

Have this ready. It is asked in nearly every system design loop and it is the difference
between "I read about it" and "I did it".

| Part | What to say |
| --- | --- |
| **Situation** | The system, its scale, the constraint that hurt most |
| **Task** | The specific failure or requirement you owned |
| **Action** | Two or three decisions, each with the alternative you rejected |
| **Result** | A number, and one thing that is still unresolved |

Example shape:

> *"We were missing our 300 ms p99 on checkout. Reads were fine, so it was contention on
> the primary. We added a read replica — rejected, because checkout reads the freshly written
> cart, so staleness broke it — and instead moved seat holds to a serialisable transaction
> with a short hold timeout, plus an outbox so the confirmation event could not be lost. p99
> went from 780 ms to 190 ms and double-bookings went to zero under a 10k-concurrent test.
> The thing I would fix next is that the hold expiry sweep is still a cron job on one
> instance."*

That answer teaches: you measured, you rejected an option with a reason, you used the right
patterns, and you are honest about what remains.

---

## After the path: where to go next

| Direction | What to learn | Why it pays |
| --- | --- | --- |
| **Distributed systems theory** | Consensus, Paxos/Raft, linearizability proofs | Separates engineers who pattern-match from those who reason |
| **Data-intensive design** | The DDIA chapters on replication, partitioning, transactions, streams | The single best book in the field |
| **Platform / infrastructure** | Kubernetes, service meshes, multi-cluster | Where large systems actually run |
| **Performance engineering** | Profiling, flame graphs, query tuning, cache design | Measurable, senior-level work |
| **SRE** | SLOs, incident response, toil reduction, capacity planning | A recognised career path |
| **Security architecture** | Threat modelling, zero trust, supply chain | Scarce and durable |
