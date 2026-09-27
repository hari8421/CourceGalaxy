---
title: "Week 1 — The Claude Platform"
track: "claude"
week: 1
order: 1
type: "module"
hours: 16
summary: "Messages API anatomy, content blocks, stop_reason, streaming, model families, tokenising, retries, rate limits, and cost accounting."
tags: ["messages-api", "stop-reason", "streaming", "tokens", "cost", "retries", "sdk"]
---

# Week 1 — The Claude Platform

**Goal by Friday:** a working `claude-lab` CLI that calls the Messages API with retries and
backoff, streams to the terminal, counts tokens and dollars live, and can *explain every
value of `stop_reason` from memory*.

---

## 1. Concepts (2 h)

### 1.1 The Messages API is not a chat API

```python
from anthropic import Anthropic
import os

client = Anthropic()                                   # ANTHROPIC_API_KEY from env
MODEL = os.environ["ANTHROPIC_MODEL"]                  # never hardcode a model id

msg = client.messages.create(
    model=MODEL,
    max_tokens=1024,                                   # REQUIRED — there is no default
    system="You are a precise API documentation assistant.",   # top-level, not a message
    messages=[
        {"role": "user", "content": "Explain stop_reason in two sentences."},
    ],
)

print(msg.content[0].text)
print(msg.stop_reason, msg.usage.input_tokens, msg.usage.output_tokens)
```

Three structural differences from OpenAI-style chat, and they are all examinable:

1. **`system` is a top-level parameter**, not a message with `role: "system"`.
2. **`content` is a list of typed blocks**, not a string. Text is one block type; tool use
   and thinking are others.
3. **`max_tokens` is mandatory.** The API never infers a default. This is a deliberate
   safety design and it is also the most common source of a new integration's bugs.

### 1.2 Content blocks — the thing most candidates get wrong

`msg.content` is a list. You will receive a mix of block types, and your code must handle
each rather than assuming `content[0].text` always exists.

```python
for block in msg.content:
    match block["type"]:
        case "text":
            print(block["text"])
        case "tool_use":
            print("calling", block["name"], block["input"], "id:", block["id"])
        case "thinking":
            print("reasoning:", block["thinking"][:100], "…")
        case _:                                   # be tolerant of new block types
            print("unhandled block:", block["type"])
```

**The lesson:** a model that decides to call a tool returns **no** `text` block. Code that
does `msg.content[0].text` will raise or silently return an empty string exactly when a
tool is available — the most confusing bug in this ecosystem.

### 1.3 `stop_reason` — memorise this table

This single field is the highest-yield thing on the Developer exam. It answers "why did the
model stop?", and correct handling is the difference between a working integration and a
fragile one.

| `stop_reason` | Meaning | What you must do |
| --- | --- | --- |
| `end_turn` | The model finished its turn naturally | Return the answer. This is the happy path. |
| `max_tokens` | Hit the `max_tokens` ceiling mid-thought | **Not success.** Raise the limit, or treat as failure |
| `stop_sequence` | Matched a custom stop sequence you supplied | Usually intended; verify the content is complete |
| `tool_use` | The model wants a tool executed | Run the tool, return a `tool_result` (Week 3) |
| `pause_turn` | Long-running turn paused, can be resumed | Resume with the same messages |
| `refusal` | The model declined | Handle explicitly; never retry unchanged |

```python
if msg.stop_reason == "max_tokens":
    # Truncated output. Retrying with the same parameters truncates identically —
    # the fix is a larger budget or a smaller task, never a retry loop.
    raise TruncatedResponse(msg.content)
if msg.stop_reason == "refusal":
    return escalate_to_human(msg.content)
```

**The exam trap:** a truncated response returned to the user as if it were an answer.
"`max_tokens` means the answer is complete" is always wrong.

### 1.4 Model families and the selection decision

Anthropic ships three families with a deliberate capability/latency/cost trade-off:

| Family | Use it for | Never use it for |
| --- | --- | --- |
| **Opus** | The hardest reasoning: architecture, novel debugging, high-stakes analysis | Bulk classification, routing, anything cheap and repetitive |
| **Sonnet** | The default production workhorse: agents, RAG, code, most chat | — |
| **Haiku** | Cheap, fast, high-volume: routers, extractors, sub-tasks, simple classification | Multi-step reasoning and anything subtle |

**The exam asks "which model?" and grades the reasoning, not the name.** The defensible
answer always has this shape: *"This step is a classification over 10 categories with a
mechanical schema — Haiku at temperature 0. The synthesis step needs to weigh conflicting
evidence across 40 documents — Sonnet. We do not need Opus here because no step requires
novel reasoning; if the eval shows the extraction step is failing on ambiguous documents,
that is the step to escalate, not everything."*

Three more levers that beat a bigger model:

```python
# (a) Prompt caching — a stable prefix, marked cacheable
system=[{"type": "text", "text": LONG_REFERENCE_DOC,
         "cache_control": {"type": "ephemeral"}}]

# (b) Extended thinking — spend test-time compute on hard steps only
thinking={"type": "enabled", "budget_tokens": 4096}

# (c) A two-tier router — cheap model to triage, capable model to answer
```

> Extended thinking has hard API constraints: you cannot set `temperature` when thinking is
> enabled, `budget_tokens` must be less than `max_tokens`, and thinking blocks require
> streaming. Every one of those is fair game for a scenario question.

### 1.5 Streaming and time-to-first-token

```python
with client.messages.stream(
    model=MODEL, max_tokens=1024, messages=messages
) as stream:
    for text in stream.text_stream:            # yields decoded deltas
        print(text, end="", flush=True)
    final = stream.get_final_message()         # the complete Message, same shape as non-streaming
    print("\n", final.stop_reason, final.usage)
```

Two habits that matter in production:

- **Always stream to a human-facing UI.** Non-streaming means 2–8 seconds of blank screen.
- **Read `usage` from the final message**, not from a running guess. Under streaming the
  usage arrives with the terminal event.

### 1.6 Errors, retries and rate limits — never skip this section

```python
import time, random
from anthropic import APIStatusError, APIConnectionError, RateLimitError, OverloadedError

def robust_messages(**kwargs):
    """SDK-level retries handle 429/5xx/connection errors. App-level retries handle
    the rest — and jitter, always."""
    client = Anthropic(max_retries=2)          # SDK: honours retry-after, exponential backoff

    for attempt in range(4):
        try:
            return client.messages.create(**kwargs)
        except (OverloadedError, APIConnectionError):
            time.sleep(min(2 ** attempt + random.uniform(0, 1), 30))
        except RateLimitError as e:
            time.sleep(float(getattr(e, "retry_after", 2 ** attempt)))
        except APIStatusError as e:
            if e.status_code < 500:
                raise                                 # 400/401/403 will not fix themselves
            time.sleep(2 ** attempt)
    raise RuntimeError("Claude unavailable after 4 attempts")
```

The distinctions the exam rewards:

| Situation | Retry? | Why |
| --- | --- | --- |
| `429` rate limit | Yes, honour `retry-after` | Transient by definition |
| `529` overloaded | Yes, back off with jitter | Capacity, not your fault |
| Connection error | Yes | Transient |
| `400` / `401` / `403` | **Never** | A malformed request stays malformed |
| `max_tokens` truncation | **Never** | Deterministic — the same input truncates again |

**A retry that cannot change the outcome is a bug that costs you money.**

### 1.7 Tokens and cost

```python
# Exact, before you send — the right way to budget a request
count = client.messages.count_tokens(
    model=MODEL, system=SYSTEM, messages=messages
)
print(count.input_tokens)
```

```python
@dataclass
class Usage:
    input: int = 0
    output: int = 0
    cache_read: int = 0
    cache_write: int = 0
    calls: int = 0

    def cost(self, price_in: float, price_out: float, cache_discount: float = 0.1) -> float:
        billable_in = (self.input * (1 - cache_discount)) + (self.cache_read * 0.1)
        return (billable_in / 1e6) * price_in + (self.output / 1e6) * price_out
```

`usage` on a response reports `input_tokens`, `output_tokens`, and — when caching is active —
`cache_creation_input_tokens` and `cache_read_input_tokens`. Read all four or your cost
model is wrong.

---

## 2. Lab — `claude-lab` (the week's main build)

```
claude-lab/
├── .env
├── requirements.txt
├── client.py      # robust_messages, retry, usage accounting
├── cli.py         # streaming REPL with a live cost meter
├── tokens.py      # count_tokens budget check
└── drills.py      # force every stop_reason
```

### 2.1 The wrapper

```python
from __future__ import annotations
import os, time, random
from dataclasses import dataclass
from anthropic import Anthropic, APIStatusError, APIConnectionError, RateLimitError, OverloadedError

MODEL = os.getenv("ANTHROPIC_MODEL", "sonnet")
PRICES = {                       # USD per 1M tokens — read from the pricing page, do not trust memory
    "opus":   (15.00, 75.00),
    "sonnet": (3.00, 15.00),
    "haiku":  (0.80, 4.00),
}
client = Anthropic(max_retries=2)


@dataclass
class Usage:
    input: int = 0
    output: int = 0
    calls: int = 0
    latency_ms: float = 0.0

    def add(self, u) -> None:
        self.input += u.input_tokens
        self.output += u.output_tokens
        self.calls += 1

    def cost(self) -> float:
        pin, pout = PRICES.get(MODEL, (0.0, 0.0))
        return self.input / 1e6 * pin + self.output / 1e6 * pout


USAGE = Usage()


def ask(prompt: str, system: str = "", max_tokens: int = 1024) -> str:
    started = time.perf_counter()
    for attempt in range(4):
        try:
            msg = client.messages.create(
                model=MODEL, max_tokens=max_tokens, system=system,
                messages=[{"role": "user", "content": prompt}],
            )
            USAGE.add(msg.usage)
            USAGE.latency_ms += (time.perf_counter() - started) * 1000

            if msg.stop_reason == "max_tokens":
                raise TruncatedOutput(max_tokens)          # deterministic: do not retry
            if msg.stop_reason == "refusal":
                return "[refused] " + text_of(msg)
            return text_of(msg)
        except (OverloadedError, APIConnectionError):
            time.sleep(min(2 ** attempt + random.uniform(0, 1), 30))
        except RateLimitError as e:
            time.sleep(float(getattr(e, "retry_after", 2 ** attempt)))
        except APIStatusError as e:
            if e.status_code < 500:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("Claude unavailable after 4 attempts")


def text_of(msg) -> str:
    """Never assume content[0] is text — block order is not a contract."""
    return "".join(b["text"] for b in msg.content if b["type"] == "text")
```

### 2.2 A budget gate before you spend

```python
def within_budget(prompt: str, max_tokens: int, cost_ceiling_usd: float = 0.05) -> None:
    n = client.messages.count_tokens(
        model=MODEL, messages=[{"role": "user", "content": prompt}]
    ).input_tokens
    pin, pout = PRICES.get(MODEL, (0.0, 0.0))
    projected = n / 1e6 * pin + max_tokens / 1e6 * pout
    if projected > cost_ceiling_usd:
        raise BudgetExceeded(f"request would cost ${projected:.4f} > ${cost_ceiling_usd}")
```

In a certification-adjacent job interview, "I budget before I call" is a line that lands.

### 2.3 The streaming REPL

```python
import sys
from rich.console import Console
console = Console()

def chat() -> None:
    history: list[dict] = []
    while True:
        try:
            q = input("\n› ").strip()
        except (EOFError, KeyboardInterrupt):
            return
        if q in {"/exit", ""}:
            return

        history.append({"role": "user", "content": q})
        console.print()
        with client.messages.stream(
            model=MODEL, max_tokens=2048, messages=history
        ) as stream:
            for delta in stream.text_stream:
                console.print(delta, end="", highlight=False)
            final = stream.get_final_message()
        console.print()
        history.append({"role": "assistant", "content": text_of(final)})

        console.print(
            f"[dim]{final.stop_reason} · in {final.usage.input_tokens} "
            f"out {final.usage.output_tokens} · session ${USAGE.cost():.4f}[/dim]"
        )
```

Printing `stop_reason` on every turn is the fastest way to build the instinct the exam
tests.

### 2.4 Force every `stop_reason` (the highest-value 20 minutes of the week)

```python
def drills():
    # end_turn — ask a question that terminates
    ask("Name the capital of Peru. One word.")

    # max_tokens — set a tiny ceiling
    try:
        ask("Write a 2000-word essay on database indexing.", max_tokens=16)
    except TruncatedOutput:
        print("truncated, as designed")

    # stop_sequence — supply your own marker
    client.messages.create(
        model=MODEL, max_tokens=256, stop_sequences=["\n\n"],
        messages=[{"role": "user", "content": "List five databases:\n1. "}],
    )

    # tool_use — give it a tool (Week 3, but see it now)
    msg = client.messages.create(
        model=MODEL, max_tokens=512,
        tools=[{"name": "get_weather",
                "description": "Get current weather for a city.",
                "input_schema": {"type": "object",
                                 "properties": {"city": {"type": "string"}},
                                 "required": ["city"]}}],
        messages=[{"role": "user", "content": "What is the weather in Paris?"}],
    )
    print(msg.stop_reason)                    # -> tool_use
```

Run these until you can predict the `stop_reason` before executing.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Return a full 50-turn conversation; compare `usage` to `count_tokens` | History is billed, every turn |
| 2 | Stream vs non-stream the same prompt; measure TTFT | Perceived latency is the product |
| 3 | Force `max_tokens` truncation; retry unchanged; observe | Deterministic failures must not retry |
| 4 | Set a `stop_sequence` that fires mid-word | Custom stopping is your tool, not a bug |
| 5 | Add prompt caching; compare the `cache_read` numbers on the second call | Caching is visible in `usage` |
| 6 | Enable extended thinking; try to also set `temperature` | The constraint is enforced by the API |
| 7 | Replay the same task on all three model families; compare cost and quality | The selection decision, with evidence |
| 8 | Raise a `429` in a mock and watch the retry loop | Rate limits are a design constraint |

---

## 4. Deliverable — `claude-lab`

- [ ] `ask()` with SDK + app-level retries, jitter, and correct non-retryable handling
- [ ] `text_of()` that walks content blocks instead of indexing `[0]`
- [ ] Explicit handling of `max_tokens`, `refusal`, and `tool_use` — never one catch-all
- [ ] Streaming REPL with a live `stop_reason` + token + dollar line
- [ ] Pre-flight `count_tokens` budget gate
- [ ] `drills.py` that provokes every `stop_reason` and prints the observed values
- [ ] `README.md` with your measured cost for 100 calls, per model family

**Self-check:** without running anything, name the `stop_reason` for "the model wrote 400
tokens and you asked for 300", and say what the correct client behaviour is.

---

## 5. Cheat sheet

| Question | Answer |
| --- | --- |
| Where does the system prompt go? | Top-level `system=` parameter, not a message role |
| Is `max_tokens` optional? | No. It is required, and it is your truncation risk |
| What is `msg.content`? | A list of typed blocks — never assume index 0 is text |
| Model finished normally | `stop_reason == "end_turn"` |
| Output cut off | `stop_reason == "max_tokens"` — raise the budget, do not retry |
| Model wants a tool | `stop_reason == "tool_use"` — execute, return `tool_result` |
| Should you retry a 400? | Never |
| Should you retry a 529? | Yes, with backoff and jitter |
| How do you know the cost before sending? | `client.messages.count_tokens(...)` |
| Can you use `temperature` with extended thinking? | No |

| Symptom | Cause | Fix |
| --- | --- | --- |
| Empty response | Model returned a `tool_use` block | Iterate content blocks |
| Answer cut mid-sentence | `max_tokens` too low | Raise it; check `stop_reason` |
| Bill far above estimate | Long history rebilled each turn | Summarise or truncate history |
| Intermittent 429s | No rate limiting | Exponential backoff + concurrency cap |
| `NoneType.text` | `content[0]` was not a text block | Use `text_of()` |
