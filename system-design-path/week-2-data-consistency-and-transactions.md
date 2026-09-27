---
title: "Week 2 — Data: Storage, Consistency & Transactions"
track: "system"
week: 2
order: 2
type: "module"
hours: 16
summary: "Relational modelling and indexing, storage engines, sharding, replication, consistency models, isolation levels, idempotency, outbox and saga."
tags: ["database", "indexing", "sharding", "replication", "cap", "consistency", "transactions", "outbox", "saga"]
---

# Week 2 — Data: Storage, Consistency & Transactions

**Goal by Friday:** you can take a write-heavy table and produce a sharding + replication
plan with the failure modes written down — and you can justify a consistency promise per
feature instead of picking one for the whole system.

**Why this module is the longest:** data decisions are the hardest to reverse. A bad
service can be rewritten in a week; a bad sharding key takes a migration and a long night.

---

## 1. Concepts (3 h)

### 1.1 Start relational, leave when you must

**The correct default for a system design interview is a single well-indexed relational
database.** Non-relational stores are answers to specific problems, and you must be able to
name the problem.

| Need | Reasonable choice | Why |
| --- | --- | --- |
| Transactions across entities | PostgreSQL / MySQL | You get ACID for free |
| Known access patterns, joins | Relational | The index and the query planner do the work |
| Flexible schema, sparse attributes | Document store | Avoids migrations for unknown fields |
| Simple key→value lookups by id | KV store | Lowest latency, no query capability |
| Time-series or append-only events | Columnar / time-series DB | Compression and time-range scans |
| Large blobs, images, video | Object storage + CDN | Cheapest per GB, never put it in a DB row |
| Search with fuzzy matching | Search engine | Your database is not a search engine |
| Vector similarity | Vector store or pgvector | Only if you actually need embeddings |

**The interview trap:** choosing Cassandra or DynamoDB for an order-book because "it scales"
when the real problem is transactions across orders, users and payments. You have just
traded a solvable consistency problem for a hand-rolled one.

### 1.2 Indexing — the highest return on effort in a database

```sql
-- The three that carry almost all systems
CREATE INDEX CONCURRENTLY idx_orders_user_created
    ON orders (user_id, created_at DESC);          -- composite: equality column first, then sort

-- Partial index: only the rows you actually query
CREATE INDEX idx_orders_open
    ON orders (user_id) WHERE status = 'open';    -- a fraction of the table

-- Covering index: serves the query from the index alone, no table access
CREATE INDEX idx_orders_covering
    ON orders (user_id, created_at DESC) INCLUDE (status, total_cents);
```

| Rule | Why |
| --- | --- |
| Composite index column order is `equality → sort` | A range in the first column makes the rest unusable |
| An index makes reads faster and writes slower | Every insert maintains every index |
| Never index a low-cardinality boolean alone | Postgres will ignore it; use a partial index |
| Measure with `EXPLAIN (ANALYZE, BUFFERS)` | Guessing about plans is how you miss a 200 ms query |
| Watch for sequential scans on large tables | Usually a missing or unusable index |

**Know the three plan nodes:** `Index Scan` (fast, selective), `Seq Scan` (full table —
fine for small tables, catastrophic for large ones), and `Nested Loop` (fine with an index
on the inner table, terrible without).

### 1.3 Storage engines — why write-heavy systems behave oddly

| Engine | Structure | Good at | Pain point |
| --- | --- | --- | --- |
| **B-tree** (Postgres, MySQL InnoDB) | Balanced tree, ordered | Reads, range scans, transactions | Random writes |
| **LSM** (RocksDB, Cassandra, ScyllaDB) | Log + memtable + compaction | Write throughput, sequential writes | Read amplification until compaction, space amplification |
| **B+ tree page splits** | — | — | Random inserts fragment pages |

This is why "the database got slow when it grew" is usually one of two things: **B-tree page
fragmentation from random primary keys** (fix: use a sequential or hashed key), or **an LSM
compaction storm** (fix: understand your `write` and `read` amplification settings, and
give the process enough IOPS).

**Practical consequence:** UUIDs as primary keys in a B-tree are a real problem. Use a
sequence or a hash-ordered key.

### 1.4 Replication — and the lag problem

```
        writes
          │
          ▼
     ┌─────────┐   async   ┌──────────┐   async   ┌──────────┐
     │ Leader  │ ────────► │ Replica1 │ ────────► │ Replica2 │
     └─────────┘           └──────────┘            └──────────┘
       reads?              reads ✓                 reads ✓
```

- **Leader-follower** (a.k.a. master-slave / primary-replica): one writer, N read replicas.
  Simple and correct. The problem is **replication lag**: a read immediately after a write
  can miss it.
- **Multi-leader**: two or more writable nodes. Needed for multi-region writes. The problem
  is **conflict resolution** — last-write-wins silently discards data.
- **Leaderless (Dynamo-style)**: quorum reads/writes. Highly available, eventually
  consistent, and you are now implementing conflict resolution yourself.

**Read-your-writes** — the three ways to get it, and you should be able to name all three:

| Technique | How | Cost |
| --- | --- | --- |
| Sticky routing | Send the user's reads to the same replica for 30 s | Needs session affinity |
| Version/token check | Client sends the write's version; the read waits for replicas to catch up | Extra round trip |
| Read from leader | Only reads that need it go to the leader | Latency, and the leader is the bottleneck |

**Monotonic reads** — never show a user an older value after a newer one. Requires
monotonic replica reads or a version check.

### 1.5 Consistency models — pick per feature, not per system

| Model | Guarantee | Use for |
| --- | --- | --- |
| Strong | All readers see the latest write | Money, inventory counts, permissions |
| Eventual | Converges; reads may be stale | Feeds, likes, view counts, analytics |
| Read-your-writes | Your own write is visible to you | Drafts, profile edits, comments |
| Monotonic reads | You never go backwards in time | Timelines, dashboards |
| Linearizable | Strong + real-time ordering | Locks, leader election, unique names |

**The sentence that scores well:** *"The profile read is eventually consistent, but the
user always sees their own edit, so I route that request to the leader for 30 seconds
after a write. The follower count is fine being stale — nobody notices it moving from
4,998 to 5,000 a second late."*

### 1.6 CAP and PACELC — the correction everyone gets wrong

> **You do not get to "pick 2 of 3" during a partition.** During a network partition you
> must choose between **C**onsistency and **A**vailability. Partitioning is not optional —
> it is a fact of any distributed system. The real choice is what you do during the
> partition, and how much you pay for it in the normal case.

**PACELC** states it properly:

```
        Partition         Else
   ┌───────────────┬──────────────────┐
   │ A  or  C      │  L  or  P        │
   └───────────────┴──────────────────┘
```

So the design question is: **which failures are you accepting, and what is the latency cost
of your normal case?**

**Concrete mapping, and this is what interviewers want:**

| System | Choice | Why |
| --- | --- | --- |
| Payments ledger | CP — refuse writes during a partition | Correctness over availability |
| Likes counter | AP — keep serving, accept staleness | A 30-second-old count is fine |
| Inventory reservation | CP for the reservation, AP for the display | Sell correctly, display approximately |
| DNS | AP | Always answer; possibly stale |

### 1.7 Transactions and isolation levels

| Level | Prevents | Still possible |
| --- | --- | --- |
| Read uncommitted | — | Everything |
| Read committed | Dirty reads | Non-repeatable reads, phantoms |
| **Repeatable read** | Dirty + non-repeatable reads | Phantoms (mostly) |
| **Serializable** | Everything | — |

```sql
-- Serializable with retry: the correct pattern for write-write conflicts
BEGIN;
SELECT balance FROM accounts WHERE id = $1 FOR UPDATE;   -- pessimistic lock
UPDATE accounts SET balance = balance - $2 WHERE id = $1;
COMMIT;
```

- **Pessimistic** (`FOR UPDATE`): lock the row. Safe, serialises writers, can deadlock.
- **Optimistic** (version column + compare-and-swap): no lock, retry on conflict. Better for
  low contention; retry storms are the risk.
- **Isolation levels do not save you from deadlocks** or from logic bugs. You still need
  ordering discipline and short transactions.

### 1.8 Idempotency — the pattern that makes retries safe

At-least-once delivery is a fact, not a bug. Design for duplicates.

```python
def charge(customer_id: str, amount: int, idempotency_key: str) -> Receipt:
    existing = db.find_receipt_by_key(idempotency_key)
    if existing:
        return existing                                   # replay, do not re-charge

    with db.transaction():                                 # one unit of work
        db.insert_receipt(idempotency_key, customer_id, amount, status="captured")
        payments.charge(customer_id, amount)               # provider call
    return db.find_receipt_by_key(idempotency_key)
```

Three properties to state: the key is **unique per logical operation** (from the client,
not the server), the check and the write are in the **same transaction**, and the key is
retained **longer than any retry window**.

### 1.9 Outbox and saga — the two patterns for multi-service writes

**The dual-write problem:** writing to a database and publishing a message is two writes. If
the DB commits and the publish fails, they disagree forever.

```
-- The bug
db.save(order)              # commits
kafka.publish("order.created")   # fails  -> order exists, event lost
```

**The outbox pattern** puts both in one transaction, and a relay moves the event later:

```sql
BEGIN;
INSERT INTO orders (...) VALUES (...);
INSERT INTO outbox (event_type, payload, created_at) VALUES ('order.created', $1, now());
COMMIT;
-- A relay polls outbox, publishes, then marks rows sent.
-- Duplicate publishes are possible -> consumers must be idempotent.
```

**Saga** distributes a single business transaction across services. Two flavours:

| Choreography | Orchestration |
| --- | --- |
| Each service reacts to events | A coordinator drives the sequence |
| No central logic, good for simple flows | Explicit, good for long or branching flows |
| Hard to see the whole picture | The flow is one readable function |
| More event coupling | The coordinator is a SPOF if not built carefully |

**Sagas require compensating actions**, not rollbacks — you cannot roll back an email
already sent, so you send a correction. Say this explicitly in an interview; it signals
real experience.

```python
# Compensation is business logic, not a database rollback
COMPENSATIONS = {
    "order.created":   "order.cancelled",
    "payment.captured": "payment.refunded",
    "email.sent":       "email.apology_sent",     # you cannot unsend an email
}
```

**Two-phase commit** between services is the thing to avoid: it is blocking, and a
coordinator failure leaves locks held. Say that when someone proposes it.

---

## 2. Lab — sharding and replication plan (the week's main build)

**Spec:** a write-heavy `events` table, 20k writes/sec sustained, 90-day retention, one
region today, two in 18 months.

### 2.1 Choose the shard key, and defend it

```python
# Candidate A: shard by user_id
#   + all of a user's events land on one shard -> "my activity" is a single-shard query
#   + scales with users (the growing axis)
#   - a "trending" query needs every shard (scatter-gather, slow)
#   - a hot user can hot-spot one shard

# Candidate B: shard by time range
#   + retention becomes a partition drop, not a delete
#   + writes are spread evenly
#   - "all events for user X in the last year" fans out
#   - a single hot day is a hot shard

# Decision: shard by hash(user_id), partition by time inside each shard.
```

**The three questions to ask about any shard key:**

1. **Does the dominant query touch one shard?** If no, you have added a distributed problem.
2. **Is the distribution even?** Hash keys are even; a tenant with 40 % of traffic is not.
3. **What happens when it is re-sharded?** Splitting a shard is a migration; plan for it.

### 2.2 Write the plan

```markdown
## Sharding
- 32 shards by hash(user_id), virtual buckets to allow splitting later.
- 16 time partitions per shard (90 days at ~6 days/partition), dropped by scheduled job.
- Each shard: 1 leader + 2 read replicas.

## The hot-shard problem
User U writes 3,000 events/sec. Mitigation: per-shard write rate limiter that returns
429 and asks the client to batch; alert at 60% of shard write capacity.

## Re-sharding
Virtual buckets (1024) map to physical shards, so a split moves buckets, not rows.
Dual-write during migration, reconcile from the log, cut over, then delete the old owner.

## The dominant query
SELECT * FROM events WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
-> single shard, uses idx_events_user_created (user_id, created_at DESC). No scatter-gather.

## Failure behaviour
Shard leader down -> reads promoted from replica, writes 503 with Retry-After.
Global: no single shard holds > 5% of total writes (verified in staging).
```

### 2.3 Prove the index works

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM events
 WHERE user_id = 'u_42' AND created_at > now() - interval '7 days'
 ORDER BY created_at DESC LIMIT 50;
-- expect: Index Scan using idx_events_user_created, execution time ~0.4 ms
```

Run it before and after dropping the index so you have seen both plans. Then put the
before/after in your README.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Shard a `users` table by `tenant_id`; find the super-tenant failure | Shard keys are a business decision |
| 2 | Take a `posts` table and design indexes for 3 different queries | Indexes are per access pattern |
| 3 | Kill a read replica mid-query; observe the failure mode | Replication lag and promotion are design inputs |
| 4 | Implement an idempotency key; fire the same request 5 times | Duplicates are a delivery guarantee |
| 5 | Write the outbox relay for a `payment` service | The dual-write bug, fixed |
| 6 | Convert a two-service transaction into a saga with compensations | Why 2PC is avoided |
| 7 | Decide CP vs AP for 6 features you use daily | The consistency decision becomes intuition |

---

## 4. Deliverable — data layer plan

- [ ] Shard key chosen from two candidates, with a written defence
- [ ] Partitioning strategy and how retention actually happens
- [ ] Replication topology, plus the read-your-writes technique per feature
- [ ] A consistency table: every feature, its promise, and how it is enforced
- [ ] Index set with `EXPLAIN ANALYZE` output before and after
- [ ] Outbox implementation with an idempotent consumer
- [ ] A re-sharding plan that does not require downtime
- [ ] Written failure behaviour for: shard leader down, replica lag, region partition

---

## 5. Self-check

1. When is a relational database the wrong answer? Name the problem, not the technology.
2. A user updates their profile then immediately reloads. What do you need, and name two ways to get it.
3. Replication lag is 4 seconds. Which features break, and which do not?
4. What is the dual-write problem, and what does the outbox pattern actually guarantee?
5. Why is exactly-once delivery usually a marketing term?
6. Your shard key sends one tenant's traffic to one shard and it is saturated. What do you do?

---

## 6. Cheat sheet

| Decision | Answer |
| --- | --- |
| Default datastore | One well-indexed relational DB |
| Composite index order | equality columns, then the sort column |
| Read-heavy | Replicas + cache |
| Write-heavy | Shard, batch writes, queue the rest |
| Reads after writes | Sticky routing, version check, or read the leader |
| Money | Strong consistency, serialisable, single writer |
| Likes, views, feeds | Eventual is fine |
| During a partition | CP for correctness, AP for availability — per feature |
| Retries | Only idempotent operations, with a key |
| Across services | Saga + outbox, never 2PC |
