---
title: "Week 1 — LLM Fundamentals"
track: "ai"
week: 1
order: 1
type: "module"
hours: 16
summary: "Tokens, embeddings, sampling, structured output, streaming, and your first real LLM application with cost accounting."
tags: ["api", "prompting", "structured-output", "streaming", "tokens", "cost"]
---

# Week 1 — LLM Fundamentals

**Goal by Friday:** you have shipped a CLI that calls a real model, forces a typed output
schema, streams tokens to the terminal, and prints exactly what it cost you.

---

## 1. Concepts (45 min)

### 1.1 Tokens, not words

Models do not see characters or words. They see **tokens** — chunks of text from a fixed
vocabulary. Everything about cost, latency, and context limits is measured in tokens.

```python
import tiktoken

enc = tiktoken.encoding_for_model("gpt-4o-mini")

text = "Refactor this function to use dependency injection, please."
ids = enc.encode(text)

print(ids)                # [8291, 1222, 261, ...]
print(len(ids))           # 11 tokens for a 12-word sentence
print(enc.decode(ids[:4]))  # 'Refactor this'
```

**Why you must internalise this:**
- A 100-page PDF is ~25,000 tokens. A naive "just put the docs in the prompt" is a $0.20 request.
- Truncation happens silently at the limit and produces confident nonsense. Always count.
- Prompt caching, chunk sizing, and context windows are all *token* problems.

**Practical rule:** never hardcode an assumption about how many tokens something is. Count it.

```python
def approx_tokens(text: str) -> int:
    """Cheap guard when tiktoken is unavailable: ~4 chars/token for English."""
    return len(text) // 4
```

### 1.2 The chat message model

Every modern LLM API is the same shape:

```
system     → role, rules, output contract   (set once, cached)
user       → the actual request
assistant  → prior model turns (you append these back)
tool       → result of a function the model asked to run
```

Two hard-won lessons:
1. **The system prompt is a contract, not a vibe.** Put the output format, the refusal
   policy, and the tone there.
2. **History grows linearly.** Turn 20 costs ~20× turn 1. Summarise or truncate old turns.

### 1.3 Sampling: temperature, top_p, and why output varies

The model emits a probability for every possible next token. Sampling parameters decide
which one gets picked:

- `temperature=0` → almost deterministic. Use for **extraction, classification, tool-arg
  generation, anything parsed by code**.
- `temperature=0.7–1.0` → creative variation. Use for **brainstorming, copy, ideation**.
- `top_p=1.0` with `temperature<1` → a slightly different way to say the same thing. Change
  one, not both.

**Professional take:** most teams ship `temperature=0` and complain the output is boring.
The fix is rarely a hotter temperature — it is a better instruction or a better context.

### 1.4 Embeddings: text as coordinates

An embedding is a list of ~1,500 floats that puts *semantically similar* text close
together and unrelated text far apart. Cosine similarity between two embeddings is a
relevance score in `[-1, 1]`.

```
"dog"   ─┐
"puppy" ─┼──→ all sit in the same neighbourhood
"canine"─┘
"invoice" ──→ far away
```

That single property is the entire basis of semantic search, RAG, clustering, and
recommendation. You do not need to understand the maths to use it well.

### 1.5 System anatomy of an LLM app

```
        ┌───────────────────────────────────────────────┐
user →  │ 1. Load state: history, memory, user context │
  query │ 2. Build context: retrieve relevant chunks   │  ← Week 2
        │ 3. Compose prompt under a token budget      │
        │ 4. Call model (stream, retry, timeout)      │
        │ 5. Validate / repair output (schema)        │
        │ 6. Log: tokens, latency, cost, trace id     │
        │ 7. Return answer (+ citations)              │
        └───────────────────────────────────────────────┘
```

Steps 5–6 are where professionals differ from hobbyists. **You build them in this module.**

---

## 2. Lab — `llm-lab` (the week's main build)

### 2.1 Scaffold

```
llm-lab/
├── .env
├── requirements.txt
├── llm.py            # thin, typed wrapper around the provider
├── schemas.py        # pydantic models = the output contract
├── cli.py            # streaming REPL
└── costs.py          # token + price accounting
```

### 2.2 The typed client (`llm.py`)

```python
from __future__ import annotations

import os, time, logging
from dataclasses import dataclass, field
from openai import OpenAI

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
# Prices are USD per 1M tokens. Update from the provider's pricing page.
PRICES = {"gpt-4o-mini": (0.15, 0.60), "gpt-4o": (2.50, 10.00)}

client = OpenAI()


@dataclass
class Usage:
    """Accumulates tokens + dollars across a process lifetime."""
    prompt: int = 0
    completion: int = 0
    calls: int = 0
    latency_ms: float = 0.0

    def cost(self, model: str = MODEL) -> float:
        pin, pout = PRICES.get(model, (0.0, 0.0))
        return (self.prompt / 1e6) * pin + (self.completion / 1e6) * pout

    def add(self, u) -> None:
        self.prompt += u.prompt_tokens
        self.completion += u.completion_tokens
        self.calls += 1


USAGE = Usage()


def chat(messages: list[dict], *, temperature: float = 0.0, max_tokens: int = 800):
    started = time.perf_counter()
    try:
        resp = client.chat.completions.create(
            model=MODEL, messages=messages, temperature=temperature,
            max_tokens=max_tokens,
        )
    except Exception:
        # The 1 line of AI code that is not optional.
        logging.exception("model call failed")
        raise
    finally:
        pass
    USAGE.latency_ms += (time.perf_counter() - started) * 1000
    if resp.usage:
        USAGE.add(resp.usage)
    return resp.choices[0].message.content
```

**Note what is *not* here:** no retry loop yet. You will add one in Week 4, and you will
remember this moment.

### 2.3 The output contract (`schemas.py`)

Never parse free text when you can demand structure.

```python
from typing import Literal
from pydantic import BaseModel, Field, ValidationError

class Ticket(BaseModel):
    category: Literal["billing", "bug", "how_to", "other"]
    urgency: Literal["low", "medium", "high"]
    summary: str = Field(max_length=120)
    needs_human: bool
    confidence: float = Field(ge=0, le=1)

EXTRACT_SYSTEM = """You classify support tickets.
Return ONLY JSON matching this shape:
{"category": "billing|bug|how_to|other", "urgency": "low|medium|high",
 "summary": "<=120 chars", "needs_human": bool, "confidence": 0.0-1.0}
Escalate (needs_human=true) if the user mentions data loss, legal, or angry tone."""
```

Two ways to enforce it — **use both** in real code:

```python
# (a) JSON mode: the model is constrained to valid JSON
msg = client.chat.completions.create(
    model=MODEL, response_format={"type": "json_object"},
    messages=[{"role": "system", "content": EXTRACT_SYSTEM},
              {"role": "user", "content": ticket_text}],
)

# (b) Native structured output: schema is enforced by the API. Preferred.
msg = client.chat.completions.create(
    model=MODEL,
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "ticket",
            "schema": Ticket.model_json_schema(),
            "strict": True,
        },
    },
    messages=[{"role": "system", "content": EXTRACT_SYSTEM},
              {"role": "user", "content": ticket_text}],
)

try:
    result = Ticket.model_validate_json(msg.choices[0].message.content)
except ValidationError as e:
    raise RetryableError(f"schema violation: {e}")   # -> retry, then fall back
```

**Always validate, even with strict schemas.** Models occasionally violate length/format
constraints. A `ValidationError` you handle is an outage you avoided.

### 2.4 Streaming CLI (`cli.py`)

Perceived latency is the single biggest UX factor. Streaming cuts time-to-first-token from
2,000 ms to ~300 ms.

```python
from rich.console import Console
console = Console()

def stream_chat(messages, history=[]):
    messages = messages + history
    print()
    with client.chat.completions.create(
        model=MODEL, messages=messages, stream=True, temperature=0.7
    ) as stream:
        chunks, reply = [], []
        for event in stream:
            if not event.choices:
                continue
            delta = event.choices[0].delta.content or ""
            if delta:
                chunks.append(delta)
                reply.append(delta)
                console.print(delta, end="", highlight=False)
            if event.usage:
                USAGE.add(event.usage)
    console.print()
    history.extend([{"role": "user", "content": messages[-1]["content"]},
                    {"role": "assistant", "content": "".join(reply)}])
    return history
```

Add a live token counter while streaming (`len(tiktoken.encode(chunk))` accumulated) —
watching tokens tick up is how cost awareness becomes instinct.

### 2.5 A 20-line quality loop

This is the *entire* methodology you will use for the next three weeks:

```python
TESTS = [
    ("I was double charged for June, this is unacceptable", "billing", "high", True),
    ("How do I rotate my API key?", "how_to", "low", False),
    ("The dashboard takes 30 seconds to load", "bug", "medium", False),
    ("My whole company lost access, we are panicking", "bug", "high", True),
]

def run_eval(fn) -> dict:
    hits = 0
    for text, cat, urg, human in TESTS:
        r = fn(text)
        ok = (r.category == cat and r.urgency == urg and r.needs_human == human)
        hits += ok
        print(f"{'PASS' if ok else 'FAIL'}  {text[:40]:42} got={r.category}/{r.urgency}")
    return {"accuracy": hits / len(TESTS)}
```

Run it. Get a number. Change **one thing** (the prompt, the temperature, the model). Run it
again. Keep the change only if the number went up. **This is the job.**

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Token profiler: print tokens + est. cost for 20 inputs of your own text | Token intuition; spot that code costs ~3× prose |
| 2 | Same prompt at `temperature` 0 / 0.7 / 1.5, 3 runs each | Why extraction needs 0; how to *demonstrate* nondeterminism |
| 3 | Embed `["refund","return money","cancel order"]` and print pairwise cosine sim | That synonyms cluster, which is why RAG works |
| 4 | Build `robust_chat()`: 3 retries, exponential backoff, 30 s timeout, last-resort fallback string | The wrapper every production app needs |
| 5 | Truncation attack: give a model 8 turns of nonsense then a real question; count where it fails | Context-window discipline |
| 6 | Schema-failure injection: feed 20 adversarial inputs to your extractor, log every `ValidationError` | Designing for the 2 % edge cases |

---

## 4. Deliverable — `llm-lab` on GitHub

- [ ] `chat()` with retries, backoff, timeout, timeout-aware fallback
- [ ] Streaming REPL with a live token + dollar counter
- [ ] `Ticket` extractor using native structured output + pydantic validation
- [ ] `run_eval()` over ≥ 20 labelled cases, printed as a pass rate
- [ ] `README.md` with: one-command run, the eval number, and cost for 100 calls

**Interview question this earns you:** *"How would you decide between JSON mode and native
structured output, and what do you do when the model still returns bad data?"*

---

## 5. Self-check

1. Why does `temperature=0` still occasionally return different text?
2. Your prompt is 1,900 tokens and the model's limit is 2,048. What exactly breaks, and how
   do you detect it before the user does?
3. Structured output guarantees valid JSON. Why validate it again anyway?
4. How many times more expensive is a 10-turn conversation than the same question asked
   once? What do you do about it?
5. Where in your codebase would you put the retry logic, and why not inside the UI?

---

## 6. Cheat sheet

```python
# Minimal production-shaped call
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": q}],
    temperature=0.0,          # deterministic for anything parsed
    max_tokens=600,          # ALWAYS set it; protects cost
    timeout=30,              # your wrapper's job
    max_retries=2,           # SDK-level; app-level retries too
)
tokens = resp.usage.total_tokens
```

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Ignores the format | Format buried in the user turn | Move contract to `system` + native schema |
| Cuts off mid-sentence | `max_tokens` too low | Raise it; check finish_reason == "length" |
| Nonsense on long input | Silent truncation | Count tokens before sending |
| Cost spiked overnight | Unbounded `max_tokens` + retry storm | Cap tokens, cap retries, add a budget alarm |
| Same input, different output | temperature > 0 | Set 0, and cache the result anyway |
