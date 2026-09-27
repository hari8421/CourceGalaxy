---
title: "Week 4 — Reliability, Observability & Cost"
track: "system"
week: 4
order: 4
type: "module"
hours: 16
summary: "SLIs and SLOs, error budgets, failure containment, timeouts and retries, distributed tracing, capacity planning, cost engineering, multi-region DR, and security boundaries."
tags: ["slo", "error-budget", "observability", "tracing", "capacity-planning", "cost", "disaster-recovery", "multi-region", "security"]
---

# Week 4 — Reliability, Observability & Cost

**Goal by Friday:** a written SLO with an error-budget policy, a dashboard definition, a
cost model, and one chaos experiment you have actually run.

**The shift in this module:** Weeks 1–3 built a system that works. This week makes it
**operable by someone else at 3am** — including you, six months from now, having forgotten
everything.

---

## 1. Concepts (3 h)

### 1.1 SLIs, SLOs, and SLAs

| Term | Definition | Example |
| --- | --- | --- |
| **SLI** | The measurement | p99 latency of `POST /checkout` |
| **SLO** | The target for that measurement | p99 < 300 ms, 99.9 % of requests |
| **SLA** | The contractual promise, with consequences | 99.95 % monthly, credits otherwise |

**Pick the right SLI.** The four-question test — a good SLI answers *do users feel it?*:

| User journey | Good SLI |
| --- | --- |
| "Can I log in?" | % of login attempts succeeding (not % of /auth calls) |
| "Can I search?" | % of searches returning results in < 1 s |
| "Does checkout work?" | % of carts that convert to a paid order |
| "Is my data correct?" | Successful reconciliation checks, not request count |

**Traffic and errors are not availability.** A 404 storm with 100 % success rate is a total
outage from the user's perspective. This is why journey-based SLIs exist.

### 1.2 The error budget, and what you do with it

> **Availability target + window = error budget.** 99.9 % over 30 days ⇒ ~43 minutes of
> allowed failure per month.

```python
def budget_remaining(errors: int, total: int, target: float = 0.999) -> float:
    """Fraction of the month's budget still unspent."""
    allowed = total * (1 - target)
    return max(0.0, 1 - errors / allowed) if allowed else 1.0
```

**The point of the budget is that it authorises decisions:**

| Budget state | What it permits |
| --- | --- |
| Healthy (>75 % left) | Ship freely, run experiments, take risks |
| Tense (25–75 %) | Bug fixes and stability work first; no risky migrations |
| Exhausted (<25 %) | **Feature freeze.** Stabilise, then resume |

This is the single most useful thing you can hand a product team: *"we have 18 % of our
monthly error budget left, so I am pausing the migration until the checkout p99 is back
under target."* It converts reliability from an argument into a shared resource.

### 1.3 Timeouts, retries, circuit breakers, bulkheads

Four patterns that travel together. Get all four in the right places.

```python
# 1. Timeout — on EVERY outbound call, always. A call without a timeout is a bug.
result = client.get("/orders", timeout=1.5)            # seconds, and it must be below
                                                        # the caller's own deadline

# 2. Retry — only idempotent, with exponential backoff AND jitter
for attempt in range(3):
    try:
        return call(timeout=1.5)
    except TransientError:
        time.sleep(min(0.2 * 2 ** attempt, 5) * random.uniform(0.5, 1.5))

# 3. Circuit breaker — fail fast instead of queueing behind a dead dependency
@retryable(circuit=CIRCUITS["payments"])
def charge(...): ...

# 4. Bulkhead — isolate pools so one slow dependency cannot starve the rest
executor = ThreadPoolExecutor(max_workers=20)          # its own pool per dependency
```

**The retry rule that prevents incidents:** a retry multiplies load precisely when the
system is least able to handle it. Always exponential backoff with jitter, always a cap,
never retry a non-idempotent operation without a key, and **never retry at more than one
layer** — three services each retrying three times is 27× the original traffic.

### 1.4 Observability: metrics, logs, traces — and what each is for

| Signal | Answers | Do not use it for |
| --- | --- | --- |
| **Metrics** | Is it happening, and is it changing? Trends, alerting | Understanding *why* |
| **Logs** | What happened in this specific case? | Rates and trends |
| **Traces** | Where did the time go across services? | High-cardinality querying |

**The four golden signals** (Google SRE, and still the best starting set):

```
Latency     — p50, p95, p99 of the user journey
Traffic     — requests/sec, by route
Errors      — 5xx rate, and the error *types*
Saturation  — how full is the constraint? DB pool, queue depth, CPU, memory
```

**Saturation is the leading indicator.** Queues fill and error rates rise *afterwards*.

```python
# One trace per request, propagated across every service and every hop
with tracer.start_as_current_span("checkout") as span:
    span.set_attribute("user.tier", user.tier)
    span.set_attribute("order.total_cents", order.total_cents)   # low-cardinality only

    with tracer.start_as_current_span("payments.charge") as child:
        child.set_attribute("provider", "acme")
        charge()
```

**Trace context must survive the queue.** Put the trace headers in the message envelope,
not just in the HTTP request — otherwise your async path is invisible.

**Cardinality is the trap.** `user_id` as a metric label will melt your metrics backend.
Send identifiers as **trace attributes and log fields**, not as metric labels.

### 1.5 Capacity planning

```
Required capacity = peak_rps × headroom
Cost per month     = instances × unit_cost × hours + storage + egress + managed services
```

| Question | Where the answer comes from |
| --- | --- |
| When will we run out? | Growth trend × current headroom |
| What is the cheapest unit of scale? | Instance size, then autoscaling, then architecture |
| What is the expensive unit? | Egress, cross-AZ traffic, managed-service licenses, IOPS |

**Plan for the peak, size for the average, and label both.** Over-provisioning for peak
wastes money; under-provisioning for peak means an outage.

### 1.6 Cost as a design input

Cost engineering is not an afterthought — the architecture determines the bill.

| Decision | Cost effect |
| --- | --- |
| Cache hit ratio | Directly linear on read cost. 95 % vs 70 % is a 3× bill difference |
| Cross-AZ traffic | Charged per GB, often the surprise on the invoice |
| Data egress | The most commonly underestimated line item |
| Read replicas | Cheaper than scaling the primary, until you need more than a few |
| Over-provisioned headroom | Pure waste — set it by SLO, not by anxiety |
| Retention | Storing 7 years of logs you never read |

**Three moves that reliably cut cost without hurting users:** raise the cache hit ratio,
send logs to a cheap tier with a hot/cold split, and delete data on a schedule you actually
enforce.

### 1.7 Multi-region and disaster recovery

| Term | Meaning | Typical RTO / RPO |
| --- | --- | --- |
| **Multi-AZ** | Several zones, one region | minutes / ~0 |
| **Active-passive** | Hot standby region, failed over manually | hours / minutes |
| **Active-active** | Both regions serve; replicate both ways | minutes / seconds |

**The hard part is not failover, it is the split brain.** Two regions both accepting writes
during a partition means two sources of truth. You must choose:

- **Route by home region** (accept stale reads from the other), or
- **A single writer region with an explicit, slow, deliberate promotion.**

```python
# Explicit promotion beats "both are up" for a system that must not fork
def write_allowed(region: str) -> bool:
    if region == PRIMARY_REGION:
        return True
    return CLUSTER.epoch == PRIMARY_PROMOTED_EPOCH     # fencing token, not a boolean
```

**And the unglamorous half: backups you have never restored.** A backup you have not restored
is a hypothesis. Run the restore drill on a schedule and record how long it actually takes.

### 1.8 Security boundaries that belong in the design

| Boundary | Mechanism |
| --- | --- |
| Authentication | Who is calling — mTLS, OIDC, signed tokens with short expiry |
| Authorization | What they may do — RBAC for roles, **ABAC for data** |
| Multi-tenancy | Row-level security or a schema per tenant; isolation tested, not assumed |
| Encryption | TLS in transit, encryption at rest, per-tenant keys where required |
| Secrets | A secret manager, rotation, never in the repo or the image |
| Audit | Immutable log of who accessed what, retained per compliance rules |
| Supply chain | Pinned dependencies, image scanning, signed builds |

**The one multi-tenancy bug worth naming:** a query that filters by `user_id` but forgets
`tenant_id` is a data breach. Enforce it in the database (row-level security), not in
application code review.

---

## 2. Lab — make it operable (the week's main build)

### 2.1 Write the SLO and the policy

```markdown
## SLIs
- checkout_success: paid orders / checkout attempts          (target 99.5 %)
- checkout_latency: p99 of POST /checkout                    (target < 300 ms)
- read_latency: p99 of GET /feed                             (target < 200 ms)

## SLOs
- checkout_success: 99.5 % over 30 days
- checkout_latency: 99 % of requests < 300 ms
Availability target: 99.9 % ⇒ 43 min/month error budget.

## Error budget policy
- >75 % remaining: normal release cadence.
- 25–75 %: reliability work is prioritised over features.
- <25 %: feature freeze until the budget recovers two consecutive weeks.

## Alerts that page
- checkout_success < 99 % for 5 minutes
- checkout_latency p99 > 300 ms for 10 minutes
- DB pool saturation > 80 % for 5 minutes
- error budget projected to be exhausted before month end
```

### 2.2 Build the dashboard definition

Panels, in this order, because this is the order you debug in:

1. **Journey success rate** (not endpoint success rate)
2. **Latency percentiles per route** — p50 / p95 / p99 on separate panels, never averaged
3. **Saturation** — DB pool active/max, queue depth, consumer lag, CPU, memory
4. **Error rate by type** — 5xx broken down, so you see *which* failure
5. **Dependency health** — each external call: rate, latency, error rate
6. **Business signal** — orders per minute, so an outage is visible even at 0 % errors

### 2.3 Run a chaos experiment

```python
"""Kill the cache and verify the system degrades rather than dies."""
def test_survives_cache_loss():
    CACHE.flushall()                        # sudden total cache loss
    responses = [client.post("/checkout", json=order) for order in orders * 20]
    latencies = sorted(r.elapsed_ms for r in responses)
    assert all(r.status_code in (200, 429) for r in responses)   # never a 5xx storm
    assert latencies[int(len(latencies) * 0.99)] < 2000         # p99 under 2 s
    assert db.pool_in_use() < db.pool_size                     # DB not saturated
```

Run it, record what happened, and fix whatever it exposes. That test is the deliverable —
running it successfully the first time is not the goal.

### 2.4 The cost model

```markdown
| Line item            | Driver                    | Monthly  | Reduce by                    |
|----------------------|---------------------------|----------|-------------------------------|
| App instances        | avg CPU × 30% headroom    | $2,400   | better packing, HPA           |
| RDS primary + 2 RO   | IOPS, storage             | $1,900   | right-size, drop a replica    |
| Cache                | 40 GB node                |   $400   | TTL tuning, higher hit ratio  |
| Object storage       | 8 TB, low request rate    |   $190   | lifecycle to cold tier        |
| **Egress**           | 1.4 TB                    | **$1,760** | CDN caching, compression    |
| Observability        | 2 TB logs + metrics       |   $620   | log sampling + hot/cold split |
| **Total**            |                           | **$7,270** |                          |

Biggest lever: egress, at 24 % of the bill, for content a CDN can serve from the edge.
```

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Delete the cache under load | Degrade, don't die |
| 2 | Set the database pool to 5 and load test | Saturation before errors |
| 3 | Latency to one dependency, watch everything behind it | Bulkheads exist for a reason |
| 4 | Make a consumer 10× slower; watch the queue depth | Backpressure signals early |
| 5 | Turn on trace context propagation through the queue | Async paths are where tracing dies |
| 6 | Estimate egress for a 5 GB video service | The most underestimated cost |
| 7 | Write alerts, then delete 80 % of them | Alert fatigue kills on-call |

---

## 4. Deliverable — operational readiness

- [ ] Three journey-based SLIs with targets and windows
- [ ] Error budget calculation and a written freeze policy
- [ ] Dashboard with the six panel groups
- [ ] No more than 5 paging alerts, each with a documented runbook link
- [ ] Timeout, retry (with jitter and a cap), circuit breaker and bulkhead on every
      dependency
- [ ] Chaos test for cache loss, with recorded results
- [ ] A cost model with the top three reduction levers identified
- [ ] DR decision recorded: active-passive or active-active, and why
- [ ] A backup restore you have actually executed, with the measured RTO

---

## 5. Self-check

1. Your API returns 100 % 2xx but every user sees an empty page. What is your availability?
2. What does an exhausted error budget authorise you to do?
3. A dependency is slow but not down. Which four patterns apply, and in what order?
4. Why is `user_id` a terrible metric label?
5. Your bill doubled. Name three architecture-level causes, before blaming the vendor.
6. How do you stop two regions from both accepting writes?

---

## 6. Cheat sheet

| Question | Answer |
| --- | --- |
| What do you measure? | Journeys: success, latency, saturation, error types |
| What is the SLO for? | Deciding when to freeze releases |
| Every outbound call needs | A timeout, shorter than the caller's deadline |
| Retry rule | Idempotent only, jittered backoff, capped, one layer only |
| Dependency is down | Circuit breaker; fail fast; degrade the feature |
| Debugging a slow request | Traces, not metrics, not logs |
| Tracing through a queue | Propagate context in the message envelope |
| Biggest surprise cost | Egress, then cross-AZ traffic |
| Split brain prevention | Fencing token / explicit single-writer promotion |
| Backups | Only real once restored |
