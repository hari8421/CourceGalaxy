---
title: "Week 5 — The Interview Playbook"
track: "system"
week: 5
order: 5
type: "module"
hours: 14
summary: "The pattern catalogue, twelve canonical problems, how to handle the scale questions, what interviewers actually score, and timed drills."
tags: ["interview", "patterns", "canonical-problems", "whiteboarding", "practice"]
---

# Week 5 — The Interview Playbook

**Goal by Friday:** three timed 45-minute designs recorded and reviewed, with the
canonical problems answered from the pattern catalogue rather than from scratch.

**Why this module exists:** design ability and interview performance are different
skills. Plenty of engineers can build the right system and fail the interview anyway,
because they stayed silent, or never estimated, or narrated a diagram instead of defending
a decision.

---

## 1. Concepts (2 h)

### 1.1 The pattern catalogue

These patterns answer most canonical questions. Learn the *situation each one is for*, not
just the name.

| Pattern | Use it when | Cost / caveat |
| --- | --- | --- |
| **Cache-aside** | Any read-heavy path | Staleness; stampede; cold start |
| **Read-through** | You want the cache to own loading | Hides the source of truth |
| **Write-behind** | Write latency dominates | **Data-loss window** |
| **Sharding** | One machine cannot hold the data or the writes | Cross-shard queries; re-sharding is painful |
| **Leader-follower** | Many reads, ordered writes | Replication lag; read-your-writes |
| **Multi-leader** | Multi-region writes | Conflict resolution; last-write-wins loses data |
| **Leaderless (quorum)** | Availability over strong consistency | You implement conflict resolution |
| **Event sourcing** | Audit trail / temporal queries required | Massive complexity; most systems do not need it |
| **CQRS** | Read and write models have very different shapes | Two models to keep in sync |
| **Saga** | A transaction spans services | Compensation, not rollback |
| **Outbox** | DB write + event publish must agree | Relay lag; duplicate delivery |
| **Idempotency key** | Any retryable non-idempotent operation | Retention window for keys |
| **Token bucket** | Rate limit with bursts allowed | Two knobs to tune |
| **Leaky bucket / token bucket at the edge** | Fairness per tenant | — |
| **Load shedding** | Overload protection | Users see errors (by design) |
| **Backpressure** | Consumer cannot keep up | Producer must slow or block |
| **Circuit breaker** | Dependency is failing | Cascading failure if mis-tuned |
| **Bulkhead** | Isolate resource pools per dependency | More pools, more memory |
| **Consistent hashing** | Many keys, high churn | Virtual nodes for balance |
| **Gossip protocol** | Membership / failure detection at scale | Eventual, probabilistic |
| **Anti-corruption layer** | Integrating a system you do not own | An extra service |
| **Sidecar** | Shared cross-cutting concerns (TLS, tracing) | More moving parts |
| **Blue/green** | Zero-downtime deploys | Double capacity during deploy |
| **Canary** | Limit blast radius of a change | Needs good metrics to judge |
| **Fan-out/fan-in** | Independent subtasks then aggregate | Aggregator is a bottleneck |
| **Side effect isolation** | Preventing cascading failure | Retries can amplify it |

**Why this is worth memorising:** when a question arrives, you are not inventing an
architecture, you are *selecting patterns and justifying them*. That is what a senior
engineer looks like.

### 1.2 The twelve canonical problems

| # | Problem | The shape of the answer |
| --- | --- | --- |
| 1 | Design URL shortener | Key generation, 25:1 read/write, cache, no sharding |
| 2 | Design a rate limiter | Token bucket, distributed store or local, per-tenant |
| 3 | Design a news feed | Fan-out on write, fan-in on read; hybrid for celebrities |
| 4 | Design WhatsApp/chat | WebSockets, presence, ordered messages, partitioning by conversation |
| 5 | Design a file storage (Dropbox) | Chunking, dedup by hash, CDN, signed URLs, metadata DB |
| 6 | Design a ticket booking site | **The consistency one.** Seat holds, saga, expiring reservations |
| 7 | Design an analytics pipeline | Ingest → queue → batch → OLAP store; late arrivals, dedup |
| 8 | Design a ride-sharing dispatcher | Matching, geo-indexing, supply/demand, surge pricing |
| 9 | Design a notification system | Priority queues, per-channel workers, retries, DLQ, dedup |
| 10 | Design a video transcoding pipeline | Job orchestration, DAGs, fan-out, storage tiers |
| 11 | Design a payment system | Ledger, idempotency, saga, reconciliation, no distributed txn |
| 12 | Design a CI/CD system | Webhook ingest, queue per job, isolation, artifact store |

**Notice what they have in common:** every one is decided by (a) the read/write ratio,
(b) the hardest single operation, and (c) the consistency requirement of the one thing
that matters. There is no mystery. There is pattern recognition plus arithmetic.

### 1.3 The questions that carry the most marks

| Signal | What it says about you |
| --- | --- |
| "I'll clarify scope first" | You do not build the wrong thing |
| "Assuming 2 writes per user per day…" | You reason with assumptions |
| "This is two terabytes, so we don't need to shard" | You can rule things out |
| "Read replicas, which means stale reads — fine here, not for balance" | You know trade-offs, not just options |
| "Let me go deep on the hardest part" | You prioritise |
| "If I split the queue by key, ordering holds per conversation" | You know where the guarantees end |
| "Here's how it fails and what I'd alert on" | You have operated things |
| "I don't know — I'd measure X" | Honest, and still useful |

**What loses marks:** jumping to a diagram, drawing six microservices when three suffice,
naming technologies without a reason, no numbers, and — the most common — going quiet.

### 1.4 Handling the scale questions

> *"Now design it for 10 million users."*

**Do not redesign from scratch.** Say this out loud:

> *"The shape stays; what changes is where the limits bind. At this scale reads no longer
> fit in one cache, so I add a CDN tier and shard the read path by user. The write path is
> the same. Let me talk through what breaks and what I'd do about each."*

**The checklist of what actually changes at 100×:**

| Limit | Symptom | Response |
| --- | --- | --- |
| Single machine RAM | Cache/DB working set | Shard, tier storage |
| Single machine disk | Data volume | Shard by key, partition by time |
| Write throughput | Primary saturated | Shard writes, queue, batch |
| Read throughput | Primary CPU | Replicas + cache + CDN |
| Network bandwidth | Latency to users | CDN, compression, regional deployment |
| Single-region outage | Availability | Multi-AZ, then multi-region |
| Team size | Coordination | Modularity, then split services |

**The honest answer scores best:** *"At this scale I'd re-examine whether one database
still works. It probably does for storage, but I'd add replicas and a queue for writes."*
Interviewers are testing whether you can *reason about the change*, not whether you have
memorised 1M-user architectures.

### 1.5 Whiteboarding and the take-home

**Whiteboard rules:**
- Draw boxes and label **every** arrow with what flows and in which direction.
- Say the story out loud while you draw. Silence is the failure mode, not messy lines.
- Leave room to redraw. Cross things out; do not defend every stroke.
- If the interviewer corrects you, update immediately and thank them. That is a *good*
  signal — you are coachable.

**Take-home design review** — what they actually check:
- [ ] Requirements and explicit non-goals
- [ ] Estimates with assumptions stated
- [ ] Trade-offs *rejected*, with reasons
- [ ] Data model and consistency promise per feature
- [ ] Failure modes and the mitigation for each
- [ ] Observability: what you would measure and alert on
- [ ] Honest open questions

**What sinks a take-home:** a wall of technology with no reasoning, no numbers, no failure
analysis, and a diagram that would not survive a code review.

---

## 2. Lab — three timed designs (the week's main build)

### 2.1 Run them properly

| Round | Problems | Conditions |
| --- | --- | --- |
| 1 | URL shortener, rate limiter, chat | Untimed, 30 min each, reference notes allowed |
| 2 | Ticket booking, analytics pipeline, notifications | 45 min each, timed, notes allowed |
| 3 | News feed, file storage, payment system | 45 min each, **no notes**, recorded |

**Record the audio.** Listen back and score yourself against this rubric:

```
1  Clarified scope and asked questions first                 /5
2  Estimated scale with stated assumptions                  /5
3  Designed a data model with a consistency promise         /5
4  High-level architecture justified box by box             /5
5  Went deep on the two hardest parts                       /5
6  Named at least one rejected option and why              /5
7  Covered failure modes and degradation                    /5
8  Named metrics, alerts, and the 3am question              /5
-------------------------------------------------------------
   33+/40 to be interview-ready
```

### 2.2 The trap questions, and their answers

| Trap | The trap | The right answer |
| --- | --- | --- |
| "Use a microservices architecture" | Free pass to over-engineer | "I'll propose services along domain boundaries and start in a well-modularised monolith where the coupling is low — splitting is easier to justify once you can see the real traffic" |
| "How would you make it real-time?" | Temptation to add Kafka | "Push on write or a change-data-capture, keep reads on the request path, and stream only where the UX needs it" |
| "What if the database goes down?" | Assuming the cache saves you | "Writes stop and the cache serves stale reads. That's a deliberate availability trade — and the circuit breaker means we fail fast rather than queue" |
| "How would you scale to 1M users?" | Rewriting the design | "Same shape; the limits that bind move from CPU to storage and network. Here's what I'd add, in order" |
| "What database would you use?" | Technology shopping | "Relational, because we need transactions across these entities. I'd move to X only if this specific problem appeared" |
| "How do you handle failures?" | Vague answer | Name three: one dependency, one shard, one region — and the mitigation for each |

### 2.3 The "I don't know" protocol

Being wrong is fine. Being wrong *loudly and confidently* is what costs you.

> *"I don't know the exact answer for that piece. What I'd do is look at the query plan in
> production, and if it's a sequential scan on a large table, add a composite index on the
> equality and sort columns. That's my first move either way."*

That gets full credit. A confident invention gets zero.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Re-answer 4 canonical problems from the pattern table only | Recognition replaces invention |
| 2 | Do a 15-min design with no architecture — requirements and data only | Depth over boxes |
| 3 | Hand a design to a colleague and defend it for 5 minutes | Finds the holes fast |
| 4 | Answer 10 "why not X" questions about your last design | Trade-off fluency |
| 5 | Watch a recorded interview and count unstated assumptions | Calibration |
| 6 | Design the same problem at 1k, 1M, 1B users | Scale reasoning is mechanical |

---

## 4. Deliverable — the interview dossier

- [ ] The 12 canonical problems, each answered in a one-page design
- [ ] Three timed 45-minute designs recorded and self-scored with the 40-point rubric
- [ ] A 2× improvement on the same rubric after the third round
- [ ] An error log: every question you could not answer, with the rule you now follow
- [ ] A written version of the 30-second project deep-dive (STAR: situation, task, action, result)
- [ ] Answers to the six trap questions, memorised

---

## 5. Self-check

1. You have 5 minutes and a blank whiteboard. What are your first three sentences?
2. Which pattern answers "the read is slow and the data never changes"?
3. You designed a chat system. Where is ordering guaranteed, and where is it not?
4. Give one design decision you would *reject* on a real system, and why.
5. The interviewer says your design is over-engineered. What do you say?
6. You cannot remember a specific API detail mid-interview. What is your sentence?

---

## 6. Cheat sheet

| Moment | Do |
| --- | --- |
| Start | Clarify scope, then estimate, then design |
| Estimate | State assumptions, round honestly, say what you do *not* need |
| Design | Boxes with labelled arrows; justify each one |
| Go deep | Pick the two hardest parts; name what you rejected |
| Scale question | Same shape; name which limit moved |
| Wrong | Update immediately, thank them |
| Don't know | Say so, describe how you'd find out |
| Finish | Failure modes, metrics, the 3am question |
