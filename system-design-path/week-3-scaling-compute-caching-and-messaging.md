---
title: "Week 3 — Scaling Out: Compute, Caching & Messaging"
track: "system"
week: 3
order: 3
type: "module"
hours: 16
summary: "Load balancing, stateless services, autoscaling, DNS and CDN, cache layers and invalidation, queues and backpressure, rate limiting, load shedding, event-driven architecture."
tags: ["load-balancer", "autoscaling", "cdn", "caching", "queues", "backpressure", "rate-limiting", "load-shedding", "event-driven"]
---

# Week 3 — Scaling Out: Compute, Caching & Messaging

**Goal by Friday:** a cache layer that survives a stampede, a queue whose consumers can
crash without losing work, and a service that degrades gracefully instead of falling over.

**The theme of this module:** **a system is not fast because it is fast. It survives because
it refuses to do work it cannot finish.** Backpressure, rate limits, and load shedding are
the three mechanisms that turn a traffic spike into a slow day rather than an outage.

---

## 1. Concepts (3 h)

### 1.1 Scaling out: make the application stateless first

| Step | What it gives you | Cost |
| --- | --- | --- |
| **Vertical scale** | Buy a bigger box. Zero code change. | Money; a ceiling; no HA |
| **Remove local state** | You can now run N identical instances | Refactoring sessions and files |
| **Horizontal scale** | Add instances behind a balancer | Load balancing, sticky sessions pain |
| **Autoscaling** | Capacity tracks load | Cold starts, warm-up, cost at peak |

**Stateless means:** no user session in memory, no local upload directory, no in-process
cache that correctness depends on, no single-instance background job.

```python
# Still stateful — breaks the moment you run two instances
class SessionStore:
    def __init__(self): self.sessions = {}          # per-process, lost on restart

# Stateless — the session lives in Redis, any instance can serve anyone
class SessionStore:
    def __init__(self, redis): self.redis = redis
    def get(self, sid): return self.redis.get(f"sess:{sid}")
```

**Where state legitimately goes:** the database, an object store, a cache, or a durable
queue. That is the whole refactor.

**Autoscaling signals, in order of usefulness:** request concurrency or queue depth
(better) over CPU (decent) over request rate (noisy). Always set a **minimum** capacity so
you survive a cold start, and a **warm-up period** so a spike does not kill instances that
are still booting.

### 1.2 The request path, front to back

```
Client
  → DNS                  resolves a name to a set of IPs
  → CDN / edge cache     serves static assets, terminates TLS, may cache responses
  → Load balancer        picks a healthy backend
  → API service (N)      stateless, horizontal
  → Cache (Redis/Memcached)
  → Primary database + replicas
  → Queue → workers      async, absorbs the spikes
  → Object storage       for blobs, with signed URLs
```

**DNS and CDN, precisely:**

- **DNS** does load balancing at the coarsest level. It is cached aggressively by
  resolvers, so it is a blunt instrument — and it is why a TTL change takes minutes to
  propagate. Never rely on DNS for failover alone; use a health-check-aware load balancer or
  a global anycast address.
- **CDN** caches static and cacheable content at the edge. It is the cheapest large
  bandwidth win available, and it also moves TLS termination closer to the user.
- **Signed URLs** for private object storage: the CDN can serve the bytes without the
  origin ever seeing a credential, and access is revocable per object.

### 1.3 Load balancing algorithms

| Algorithm | Behaviour | Use when |
| --- | --- | --- |
| Round robin | Even rotation | All backends identical and equally loaded |
| Least connections | Send to whoever has fewest open | Requests vary hugely in duration |
| **Least requests** (power of two) | Pick randomly weighted by inverse load | **The good default** — self-correcting, no shared state |
| IP hash | Same client → same backend | Only when you have no choice |
| Weighted | Fixed proportions | Heterogeneous fleet (GPU vs CPU) |

**Health checks** decide membership. Configure them properly: a TCP check is too shallow, a
check that hits a real dependency can remove every instance at once during a database blip
and turn a partial outage into a total one. **Check liveness (is the process sane) and
readiness (can it serve) separately.**

### 1.4 Caching — the pattern, and the four ways to get it wrong

```python
def cache_aside(key: str, loader: Callable[[], T], ttl: int = 300) -> T:
    """The default. The cache is a performance layer you can lose."""
    if (hit := CACHE.get(key)) is not None:
        return hit
    value = loader()                      # on a miss, the DB is the source of truth
    CACHE.set(key, value, ex=ttl + random.randint(0, 30))   # jitter!
    return value
```

| Pattern | Who writes the cache | Verdict |
| --- | --- | --- |
| **Cache-aside** | The app, on read | Default. Simple; one miss penalty |
| Read-through | The cache calls the loader | Convenience; hides the source of truth |
| Write-through | App writes both | Read-fast; write cost + write failure modes |
| Write-behind | Async cache write | Fastest writes; **data loss window** |

**The four ways it breaks, and each fix:**

1. **Invalidation.** The classic. Fix: delete the key on write, keep TTL short, and accept
   staleness deliberately. Be honest about which feature can tolerate it.
2. **Stampede.** The key expires and 10,000 requests all miss at once.

   ```python
   # Fix: a lock, or probabilistic early expiry
   def get_with_lock(key: str, loader, ttl: int = 300):
       if (hit := CACHE.get(key)) is not None:
           return hit
       with CACHE.lock(f"lock:{key}", timeout=5, blocking_timeout=2):
           if (hit := CACHE.get(key)) is not None:   # recheck after acquiring
               return hit
           value = loader()
           CACHE.set(key, value, ex=ttl + random.randint(0, 30))
           return value
   ```
3. **Cold start.** A restarted cache is a thundering herd at the origin. Fix: preload the
   hot set, or accept the spike with a rate limit in front of the DB.
4. **Hot keys.** One key receives 30 % of reads. Fix: per-instance local cache for hot keys,
   key replication, or request coalescing. A shared cache cannot fix a single hot key —
   everyone still goes to it.

**Add jitter to every TTL.** Without it, a batch of keys inserted together expires together.

### 1.5 Queues, and the guarantees that actually exist

| Delivery guarantee | Meaning | Cost |
| --- | --- | --- |
| At-most-once | May lose a message | Cheap; sometimes correct (metrics) |
| **At-least-once** | May duplicate | **The realistic default** |
| Exactly-once | Never lose, never duplicate | Rarely real across systems |

**"Exactly-once" is a marketing term.** What people mean is at-least-once plus idempotent
consumers. Design for duplicates and you get the same practical guarantee with far less
machinery.

```python
def consume(queue: Queue) -> None:
    for message in queue:                  # at-least-once
        try:
            handler(message)               # MUST be idempotent
            queue.ack(message)
        except RetryableError:
            queue.nack(message, requeue_after=backoff(message.attempts))
        except PermanentError:
            queue.move_to_dead_letter(message)     # never requeue forever
        except Exception:
            queue.move_to_dead_letter(message)
```

Five things every production consumer needs:

- **Idempotent handler** (dedupe by message id, or a unique constraint).
- **Retry with exponential backoff and jitter**, and a cap.
- **Dead letter queue**, inspected by a human. A DLQ nobody reads is a data-loss queue.
- **Visibility timeout / ack deadline**, so a crashed consumer does not hold a message
  forever, and does not re-deliver instantly.
- **Ordering key** where ordering matters: partition by key so a given key's messages stay
  in order, and accept that ordering is only guaranteed within a partition.

### 1.6 Backpressure, rate limiting, load shedding

Three different tools, often confused:

| Mechanism | What it does | When |
| --- | --- | --- |
| **Backpressure** | Slow the producer when the consumer is behind | Queue depth is the signal |
| **Rate limiting** | Cap requests per client/tenant | Abuse, fairness, cost control |
| **Load shedding** | Deliberately reject work to protect the system | The system is already overloaded |

```python
# Token bucket: allows bursts, caps the sustained rate
class TokenBucket:
    def allow(self, key: str, rate_per_sec: float, burst: int = 10) -> bool:
        now = time.monotonic()
        bucket = self.buckets.setdefault(key, (now, float(burst)))
        last, tokens = bucket
        tokens = min(burst, tokens + (now - last) * rate_per_sec)
        if tokens < 1:
            self.buckets[key] = (now, tokens)
            return False
        self.buckets[key] = (now, tokens - 1)
        return True
```

**Load shedding has a rule: shed the cheapest requests first.** Drop interactive reads
before long-running writes; drop anonymous traffic before authenticated; return a fast
`429`/`503` with `Retry-After` rather than letting requests queue until timeouts.

**A queue without a depth limit is a memory leak with extra steps.** Bound the queue, and
apply backpressure when it is full.

### 1.7 Event-driven architecture — and its failure modes

```
Producers → broker → consumers
```

Good for: decoupling, absorbing spikes, fan-out, independent scaling of read and write
paths, audit trails.

Costs you must name: **no transactions across topics**, eventual consistency everywhere,
harder debugging (no request to trace), and **schema evolution** — you are committing to a
public contract, so add fields, never rename or remove.

| Mistake | Consequence | Fix |
| --- | --- | --- |
| Publishing inside a DB transaction | Dual-write bug | Outbox pattern (Week 2) |
| Publishing large payloads | Fat messages, slow consumers | Publish an id; fetch the data |
| Assuming ordering | Wrong results | Partition by key; document the guarantee |
| One queue, many consumers with different speeds | Head-of-line blocking | Separate queues, or a fan-out exchange |
| No idempotent consumer | Duplicate side effects | Dedupe by message id |

---

## 2. Lab — build the resilience layer (the week's main build)

### 2.1 A cache with stampede protection and jittered TTL

```python
class ResilientCache:
    def __init__(self, backend, *, ttl: int = 300, jitter: int = 30, lock_timeout: float = 2.0):
        self.backend, self.ttl, self.jitter = backend, ttl, jitter
        self.lock_timeout = lock_timeout

    def get_or_load(self, key: str, loader: Callable[[], T]) -> T:
        if (hit := self.backend.get(key)) is not None:
            return hit
        # Single-flight: one loader runs, everyone else waits or recomputes
        with self.backend.lock(f"lock:{key}", timeout=self.lock_timeout, blocking=False) as acquired:
            if acquired:
                try:
                    value = loader()
                    self.backend.set(key, value, ex=self.ttl + random.randint(0, self.jitter))
                    return value
                finally:
                    pass
            # Lock held by someone else: serve slightly stale if we can, else compute
            if (stale := self.backend.get(key)) is not None:
                return stale
            return loader()
```

### 2.2 Prove the stampede is gone

```python
def test_single_flight_under_stampede():
    calls = 0
    def slow_loader():
        nonlocal calls
        calls += 1
        time.sleep(0.5)
        return "value"

    cache = ResilientCache(FakeRedis())
    with ThreadPoolExecutor(max_workers=50) as pool:
        results = list(pool.map(lambda _: cache.get_or_load("k", slow_loader), range(50)))

    assert all(r == "value" for r in results)
    assert calls <= 2, f"expected single-flight, got {calls} loader calls"
```

That assertion is the deliverable. Watch it fail when you remove the lock.

### 2.3 A queue consumer that survives a crash

```python
def run_consumer(queue, handler, *, max_attempts: int = 5) -> None:
    for message in queue:
        try:
            handler(message)                              # idempotent by message id
            queue.ack(message)
        except Retryable as exc:
            if message.attempts >= max_attempts:
                queue.dead_letter(message, reason=str(exc))    # stop, don't loop
            else:
                delay = min(2 ** message.attempts, 300) + random.uniform(0, 5)
                queue.nack(message, requeue_after=delay)
        except Exception as exc:
            queue.dead_letter(message, reason=repr(exc))      # permanent, by assumption
```

Then run the test: kill the process mid-`handler`, restart, and prove no message is lost and
no side effect is duplicated.

### 2.4 Load shedding, measured

```python
@app.post("/upload")
def upload(request):
    if SHEDDER.overloaded():                      # p95 latency above target for 30s
        return Response(status=429, headers={"Retry-After": "5"},
                        content=b"try again shortly")
    return process(request)
```

Load-test it at 3× capacity and record: what fraction was shed, what the p99 looked like
during the shed, and whether the database stayed healthy. **A system that sheds 20 % of
traffic and stays up beats one that degrades for everyone.**

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Add a cache to an endpoint, then delete it at runtime | The cache is an optimisation, not a dependency |
| 2 | Set every TTL to exactly 300 s and load test | Stampede, caused by synchronised expiry |
| 3 | Kill a consumer mid-handler; restart it | Visibility timeouts and idempotency |
| 4 | Shard a queue by key; prove ordering per key | Partitioning is the ordering guarantee |
| 5 | Rate limit per tenant, not per IP | Fairness follows identity, not topology |
| 6 | Add load shedding and load test at 3× | Graceful degradation is a design decision |
| 7 | Move a session from memory to Redis, then run 2 instances | Statelessness, concretely |

---

## 4. Deliverable — the resilience layer

- [ ] Cache with cache-aside, single-flight, jittered TTL, and a hot-key strategy
- [ ] A stampede test with an assertion on loader call count
- [ ] Queue consumer with idempotency, capped retries with jitter, and a DLQ
- [ ] A crash test proving no loss and no duplicate side effect
- [ ] Token-bucket rate limiter, per client and per tenant
- [ ] Load shedding with `Retry-After`, validated by a 3× load test
- [ ] Bounded queue depth with backpressure when full
- [ ] A load-test report: throughput, p50/p95/p99, error rate, DB pool saturation

---

## 5. Self-check

1. Your service is stateless except for a local cache. Does that block horizontal scaling?
2. 50 threads request a cold key. What happens without single-flight?
3. A queue consumer crashes while processing. What does the broker do, and what does your
   code have to guarantee?
4. When is "exactly-once" a lie, and what do you build instead?
5. Traffic is 3× normal and the database is at 90 % CPU. What do you shed first?
6. What breaks if you delete your cache entirely, and did you design for it?

---

## 6. Cheat sheet

| Problem | Mechanism |
| --- | --- |
| Cannot scale horizontally | Remove local state (session, files, in-process cache) |
| Uneven load across instances | Least-requests / power-of-two balancing |
| Cold instances die at scale-up | Minimum capacity + warm-up period |
| Read-heavy endpoint | Cache-aside + jittered TTL + single-flight |
| One key is hot | Per-instance local cache or request coalescing |
| Traffic spikes | Queue + autoscaling on queue depth |
| Overload | Load shedding, cheapest requests first, `Retry-After` |
| Abuse | Token bucket, per tenant |
| Consumer crashes | Visibility timeout + idempotent handler + DLQ |
| Services coupled | Event-driven with an outbox |
