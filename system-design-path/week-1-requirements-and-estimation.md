---
title: "Week 1 — Requirements, Estimation & the Design Loop"
track: "system"
week: 1
order: 1
type: "module"
hours: 14
summary: "Clarifying scope, doing back-of-envelope math out loud, writing NFRs, and running a 45-minute design interview end to end."
tags: ["requirements", "estimation", "capacity-planning", "nfr", "design-doc", "interview"]
---

# Week 1 — Requirements, Estimation & the Design Loop

**Goal by Friday:** you can take an ambiguous prompt and turn it, in five minutes, into a
scoped problem with numbers attached — and you have a written design doc to prove it.

---

## 1. Concepts (2 h)

### 1.1 The questions that must be asked before anything else

Almost every bad design comes from an unanswered question. Ask these first, out loud, and
write the answers down — the interviewer is scoring this as much as the architecture.

| Question | Why it changes the design |
| --- | --- |
| Who is the user, and what is the core action? | Determines the API surface and the data model |
| **Read-heavy or write-heavy?** | Read-heavy → cache and replicas. Write-heavy → sharding and queues |
| How many users *now*, and in 12 months? | Two very different systems. Pick one and say so |
| What is the **hardest single request**? | Search? upload? fan-out? That is your bottleneck |
| Latency target? p50, p95 or p99? | p99 is a different system from p50 |
| Consistency requirement per feature? | Money needs strong; "my feed" does not |
| Multi-tenant? Multi-region? | Changes isolation, data placement, and cost |
| What must **never** happen? | Data loss, duplicates, leaking tenant A's data to B |

**The two questions people forget and interviewers notice:**

- *"What is explicitly out of scope?"* — saying "I'll skip real-time analytics for now"
  is a stronger answer than silently never mentioning it.
- *"What breaks first if we are 10× over?"* — it shows you are already thinking about
  failure.

### 1.2 Estimation: the arithmetic, done out loud

Numbers are not the point. **Rounding, order of magnitude, and stating assumptions** are.

```python
# URL shortener, 100M daily active users
DAU = 100_000_000
WRITES_PER_USER = 0.2                 # assumption: state it
READS_PER_USER = 5.0                  # assumption: state it

writes_per_sec = DAU * WRITES_PER_USER / 86_400      # ~231 writes/sec
reads_per_sec  = DAU * READS_PER_USER  / 86_400      # ~5,787 reads/sec

# Storage, 5 years of retention
STORAGE_PER_URL = 500                 # bytes: id, target url, user id, created_at
urls_total       = writes_per_sec * 86_400 * 365 * 5
storage_tb       = urls_total * STORAGE_PER_URL / 1e12
# -> ~2.1 TB logical

# With 3× replication, plus room for the headroom you are told to keep:
storage_on_disk = storage_tb * 3 * 1.3                # ~8.2 TB
```

**Say the rounding out loud:**

> *"At a hundred million daily users with two writes each, that's roughly two hundred
> writes per second and six thousand reads per second. Five years at five hundred bytes per
> URL is about two terabytes, so with three replicas and some headroom I'm looking at
> single-digit terabytes — that fits comfortably on one modern database, so I don't need to
> shard for storage. I do need to think about read replicas for the read path."*

**What the interviewer is actually listening for:**

| Good signal | Bad signal |
| --- | --- |
| "Assuming two writes per user…" | Silent arithmetic with no assumptions |
| "That's two terabytes — so not a sharding problem" | "We will need to shard because it is big" |
| Rounding to the right magnitude | Claiming false precision |
| Ruling things *out* as a result | Only ever adding components |

**The highest-value sentence in estimation** is the one that says what you do **not** need.
It shows judgement, which is what is being scored.

### 1.3 Latency arithmetic

```python
# What is our budget?
TARGET_P99 = 200  # ms

# A single request that does four sequential round trips:
network = 4 * 0.5                     # ms, same DC
db_query = 3 * 0.1                    # ms, SSD reads
compute  = 20                         # ms, application
# -> ~23.5 ms of unavoidable work
# Everything else must be paid for by removing, caching, or parallelising.
```

Three rules fall out of this and you should use them constantly:

1. **Sequential network calls are the enemy.** Four serial 0.5 ms hops cost more than the
   database work. Parallelise independent calls.
2. **Prefer the chat to the database.** ~100 ns vs ~100 µs is three orders of magnitude.
3. **A cross-continent round trip (~80 ms) consumes half your p99 budget by itself.**
   Replicate data near the user or move the computation to the data.

### 1.4 NFRs — non-functional requirements, made concrete

"Highly available" is not a requirement. These are:

| NFR | Concrete version | How you verify it |
| --- | --- | --- |
| Availability | 99.9 % monthly (≈43 min downtime) | Error budget, SLI dashboard |
| Latency | p99 read < 200 ms, p99 write < 500 ms | Load test, then production percentiles |
| Durability | No acknowledged write is ever lost; RPO ≤ 5 min | Replication + backup restore drill |
| Consistency | Account balance strongly consistent; feed read-your-writes | Defined per feature, tested |
| Scalability | 10× traffic with no re-architecture | Load test at target + 2× |
| Security | Tenant data never crosses; secrets never in the repo | Tests + audit |

**The conversion that matters:** a feature-level consistency promise is the one that
determines your architecture. "Comments are eventually consistent" costs nothing. "Your
balance must never be wrong" means serialisable transactions, a single writer, or a
dedicated ledger service. Decide that per feature, write it down, and every later decision
follows from it.

### 1.5 The design document

The artefact that makes you better than the person who winged it:

```markdown
# Design: URL shortener

## 1. Requirements
Functional: create a short URL, redirect, optional custom alias, expiry.
Non-functional: p99 read < 200 ms; reads:writes = 25:1; no lost writes;
               ~231 writes/sec at 100M DAU.
Out of scope: analytics dashboard, link-in-bio pages, monetisation.

## 2. Estimation
~2.1 TB logical for 5 years. 3 replicas → ~8 TB. No sharding needed.
Cache hit ratio target 95 % absorbs the read traffic.

## 3. API
POST /urls {long_url, custom_alias?, ttl?} -> {short_code, created_at}
GET /{short_code} -> 307 to long_url

## 4. Architecture
Client → CDN → Load balancer → (cache) → API service → Postgres (leader) + 2 read replicas
                     → Redis (cache-aside)                → queue → analytics worker

## 5. Deep dive
### 5.1 Short code generation
### 5.2 Cache invalidation on overwrite
### 5.3 Hot-key protection

## 6. Failure & operations
Redis down → fall through to Postgres. Postgres replica lag → serve slightly stale
expiry. Metrics: cache hit ratio, redirect p99, 5xx rate, queue depth.

## 7. Open questions
Do we need per-alias analytics? What is our DR target in another region?
```

Sections 5 and 7 matter most and get skipped most. **"Open questions" is a sign of an
honest engineer, not an incomplete one.**

### 1.6 Running the 45-minute interview

| Phase | Minutes | Do | Do **not** |
| --- | --- | --- | --- |
| Clarify | 0–5 | Ask the questions in 1.1. Write answers down. | Assume the happy path |
| Estimate | 5–10 | Arithmetic out loud, with assumptions stated | Guess silently |
| Design | 10–20 | High-level boxes first, then the data model | Jump into a microservice diagram |
| Deep dive | 20–35 | Two hardest parts; name what you rejected | Spread evenly across everything |
| Operate | 35–45 | Failure modes, metrics, what you would alert on | End with "and it's scalable" |

**Three techniques that raise your score:**

- **Think out loud.** Silent design is unscoreable. Narrate: *"I'll start with the read
  path since it's 25× the writes, and here's why."*
- **Name the trade-off, not just the choice.** *"Read replicas, which means the read path
  can be slightly stale — acceptable for a redirect, not for a balance read, so balances
  go to the leader."*
- **Ask permission to go deep.** *"This is the interesting part — want me to spend the
  next ten minutes on cache invalidation?"* Interviewers reward targeted depth.

---

## 2. Lab — design a URL shortener (the week's main build)

**Spec:** 100M DAU, 25:1 read-to-write, 5-year retention, custom aliases, optional expiry,
p99 redirect < 200 ms.

### 2.1 Write the doc first, then implement one thing

Produce all seven sections above. Then implement **only** the short-code generator, chosen
from at least three options and defended:

```python
# Option A: random base62, retry on collision
def random_code(length: int = 7, alphabet: str = ALPHABET) -> str:
    return "".join(secrets.choice(alphabet) for _ in range(length))

# Option B: hash of the URL (deterministic; the same URL always gets the same code)
def hash_code(long_url: str) -> str:
    digest = hashlib.blake2b(long_url.encode(), digest_size=8).digest()
    return base62(int.from_bytes(digest, "big"))[:7]

# Option C: per-user counter (no collision possible, but enumerable)
def counter_code(user_id: int) -> str:
    return base62(user_id) + base62(next_counter(user_id))
```

The argument you should end up able to make: **A** avoids leaking how many URLs exist and
avoids collisions by construction with enough entropy (7 chars of base62 ≈ 3.5 trillion),
but needs a unique index and a retry. **B** is idempotent and cache-friendly, but leaks
that two URLs share content, and an unkeyed hash is enumerable by anyone who guesses a
URL. **C** is collision-free and O(1) but makes every user's codes guessable from their
id — a real security concern.

### 2.2 The hot-key drill (the part everyone misses)

A single viral URL is 100% of traffic for an hour. Design against it:

```python
# Traffic-aware redirect: an in-process counter decides whether to trust the shared cache
def should_bypass_cache(code: str) -> bool:
    hits = LOCAL_HOT.get(code, 0) + 1
    LOCAL_HOT[code] = hits
    if hits > HOT_THRESHOLD:          # e.g. 1000/s locally
        return True                  # go straight to a replica, skip shared cache
    return False
```

Other answers worth being able to give: cache the hot key in every instance's local memory
with a short TTL, add a random jitter to TTLs so keys do not expire simultaneously, and
watch for a **cache stampede** on expiry.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Estimate a chat system, a photo-sharing app, and a ticketing site | Estimation is mechanical once practised |
| 2 | Take a design doc and delete every number | Watch the design collapse |
| 3 | State a p99 budget and account for every millisecond | Latency is a budget you spend |
| 4 | Write NFRs for a payments service; identify the binding one | One NFR usually drives everything |
| 5 | Design "Netflix" for 10M users, then for 1000 | Same design at two scales is a red flag |
| 6 | Record yourself doing a 20-minute design; listen back | You will hear the hand-waving immediately |
| 7 | Find a company postmortem and read the contributing factors | Failures teach the vocabulary |

---

## 4. Deliverable — URL shortener design doc + one implementation

- [ ] All seven sections, with numbers in sections 2 and 6
- [ ] Three short-code strategies compared, one chosen with reasoning
- [ ] Consistency promise stated per feature
- [ ] Explicit "out of scope" list
- [ ] A latency budget showing where the 200 ms goes
- [ ] Two open questions left genuinely open
- [ ] The short-code generator implemented with a unique-constraint test
- [ ] A hot-key protection sketch

---

## 5. Self-check

1. A design has no numbers in it. What is missing, and what happens when you add them?
2. You estimated 5 TB. What are the two questions that decide whether that is a problem?
3. Which single NFR would make you choose a single-writer ledger over a replica read?
4. You are 30 minutes into a 45-minute design and have drawn nothing. What do you say?
5. Your read path is 4 sequential DB round trips. Name three fixes.

---

## 6. Cheat sheet

| Situation | Say this |
| --- | --- |
| Starting a design | "Let me confirm scope and ask a few questions first." |
| Estimating | "Assuming X per user, that's roughly Y — so we do/don't need Z." |
| Choosing replicas | "This is eventually consistent, which is fine for reads, not for writes." |
| Adding a cache | "Cache-aside, TTL of N, invalidated on write." |
| Stuck | "Let me name the two hardest parts and go deep on those." |
| Out of time | "Here's how it fails and what I'd alert on." |
| Unknown | "I don't know — I'd find out by reading X / measuring Y." |
