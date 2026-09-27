---
title: "Week 2 — Prompt Engineering & Structured Output"
track: "claude"
week: 2
order: 2
type: "module"
hours: 18
summary: "Instructions vs system prompts, XML structure, few-shot design, prefill, forced tool choice, extended thinking, and extraction with segmented accuracy reporting."
tags: ["prompt-engineering", "structured-output", "few-shot", "prefill", "extended-thinking", "tool-choice", "evals"]
---

# Week 2 — Prompt Engineering & Structured Output

**Goal by Friday:** an extraction pipeline that reports **segmented** accuracy (per document
type × per field), plus a from-scratch prompt-optimisation loop you can defend.

---

## 1. Concepts (2.5 h)

### 1.1 The question the exam asks over and over

> *How should this rule be enforced — with a prompt instruction, or programmatically?*

Learn this table. Most free points in the exam are in it.

| Rule type | Correct mechanism | Why |
| --- | --- | --- |
| Must never skip a step (payment, KYC, deletion) | **Programmatic** — a gate, a hook, a state machine | A prompt instruction has a non-zero failure rate. Never bet money or safety on it |
| Must call a specific tool first | `tool_choice={"type": "tool","name":"…"}` | Deterministic, enforced by the API |
| Must return a specific format | Prompt instruction + 2–4 few-shot examples | Works, but verify by parsing |
| Must classify with judgement | Prompt instruction + explicit criteria + examples | Needs reasoning, not a gate |
| Must refuse a category | Prompt instruction **and** output validation | Belt and braces |

**The elimination heuristic:** if a wrong answer has financial, security or safety
consequences, look for the programmatic answer. If a wrong answer just looks sloppy, a
prompt is fine.

### 1.2 Prompt anatomy that actually works

```python
SYSTEM = """You classify support tickets for a SaaS product.

<task>
Return exactly one JSON object. No prose, no markdown fence.
</task>

<schema>
{"category": "billing|bug|how_to|feature_request|other",
 "urgency": "low|medium|high",
 "needs_human": true|false,
 "confidence": 0.0-1.0}
</schema>

<rules>
- Set needs_human=true if the message mentions data loss, a security issue,
  legal action, or an explicitly angry tone.
- confidence is your own calibrated certainty, not a hedge. Below 0.6 means
  "the ticket is genuinely ambiguous", not "I am nervous".
</rules>

<examples>
<input>I'm sorry but this is the third time I've emailed and nothing has happened. Money has left my account twice.
<output>{"category":"billing","urgency":"high","needs_human":true,"confidence":0.92}</output>

<input>Is there a way to export to CSV?
<output>{"category":"how_to","urgency":"low","needs_human":false,"confidence":0.95}</output>
</examples>"""
```

The structure that earns its keep: **role → task → schema → rules → examples → (input
elsewhere)**. Long prose instructions at the top of a wall of text are measurably worse
than tagged sections.

### 1.3 Few-shot: 2–4 examples, and make them hard

| Do | Don't |
| --- | --- |
| Include the ambiguous cases | Ten trivial examples that teach nothing |
| Show the *reasoning* in the decision, not just the label | Examples that only demonstrate formatting |
| Vary the surface form (typos, length, language) | The same sentence shape four times |
| Match the distribution of production traffic | Textbook-clean inputs the user never sends |
| Keep the label distribution roughly balanced | 9 billing, 1 bug — you have taught a prior |

**Why this matters:** few-shot examples do double duty. They teach the *format* **and**
implicitly encode the *decision boundary*. A badly chosen set teaches the wrong boundary
and you will chase the symptom with temperature for a week.

### 1.4 Prefill — the trick that most candidates never learn

You can **start the assistant's turn** and force the output shape without any parsing:

```python
msg = client.messages.create(
    model=MODEL, max_tokens=1024, system=SYSTEM,
    messages=[
        {"role": "user", "content": ticket},
        {"role": "assistant", "content": "{"},   # prefill: the reply must continue from here
    ],
)
raw = "{" + msg.content[0].text               # stitch the prefill back on
result = json.loads(raw)                        # guaranteed object, not a markdown fence
```

**Why it is exam-relevant:** it is the difference between "the model returned JSON wrapped
in ` ```json `" and "the model returned JSON". Prefill removes an entire class of
production failure without a schema feature. Combine with `stop_sequences` to close the
object deterministically.

### 1.5 Structured output via forced tool use

When you need guaranteed structure for a richer payload, define a tool whose input *is* the
output and force it. This is the cleanest pattern for extraction on Claude:

```python
EXTRACT = {
    "name": "record_extraction",
    "description": "Record the extracted fields from the document. Call this exactly once.",
    "input_schema": {
        "type": "object",
        "properties": {
            "invoice_number": {"type": "string"},
            "total_cents":    {"type": "integer", "minimum": 0},
            "currency":       {"type": "string", "enum": ["USD", "EUR", "GBP", "JPY"]},
            "line_items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"description": {"type": "string"},
                                   "quantity": {"type": "integer"},
                                   "amount_cents": {"type": "integer"}},
                    "required": ["description", "quantity", "amount_cents"],
                },
            },
        },
        "required": ["invoice_number", "total_cents", "currency", "line_items"],
    },
}

msg = client.messages.create(
    model=MODEL, max_tokens=2048, tools=[EXTRACT],
    tool_choice={"type": "tool", "name": "record_extraction"},   # forced: guaranteed schema
    messages=[{"role": "user", "content": document_text}],
)
assert msg.stop_reason == "tool_use"
data = msg.content[0]["input"]        # a dict, validated against input_schema
```

**The `tool_choice` variants you must know cold:**

| Value | Behaviour |
| --- | --- |
| `{"type": "auto"}` | Default. The model may call a tool **or** reply with text |
| `{"type": "any"}` | It **must** call some tool — the model chooses which |
| `{"type": "tool", "name": "x"}` | It **must** call exactly `x`. Deterministic |
| `{"type": "none"}` | It must not call any tool — pure text answer |

`auto` is the correct default, and choosing `auto` when you meant determinism is a
classic exam trap.

### 1.6 Extended thinking — test-time compute

```python
msg = client.messages.create(
    model=MODEL, max_tokens=8000,
    thinking={"type": "enabled", "budget_tokens": 4096},   # must be < max_tokens
    # temperature must NOT be set when thinking is enabled
    messages=[{"role": "user", "content": complex_architecture_question}],
)
```

Rules the API enforces (and the exam expects you to know):
- `budget_tokens` **must be less than** `max_tokens`.
- You cannot set `temperature` (or `top_p`/`top_k`) with thinking enabled.
- Thinking blocks are returned in `content` and you **must pass them back unchanged** on the
  follow-up turn, or the API errors — they are part of the conversation state.
- Streaming is required for very long thinking budgets.
- `max_tokens` can be billed twice: thinking tokens plus the answer. Budget accordingly.

**When to use it:** genuinely multi-step reasoning where you cannot decompose the problem
into tool calls. **When not to:** classification, extraction, routing — where you are paying
for reasoning you do not need.

### 1.7 Measure it: aggregate accuracy is a trap

```python
def evaluate(cases, fn) -> dict:
    rows = []
    for c in cases:
        got = fn(c["document"])
        ok = got["invoice_number"] == c["truth"]["invoice_number"]
        rows.append({"doc_type": c["doc_type"], "field": "invoice_number", "ok": ok, ...})

    overall = sum(r["ok"] for r in rows) / len(rows)
    by_slice = {}
    for r in rows:                              # segment by doc type AND field
        by_slice.setdefault((r["doc_type"], r["field"]), []).append(r["ok"])
    return {
        "overall": overall,
        "worst_slice": min((sum(v)/len(v), k) for k, v in by_slice.items()),
        "by_slice": {f"{d}/{f}": sum(v)/len(v) for (d, f), v in by_slice.items()},
    }
```

A suite reporting **97 % aggregate** can hide a 40 % slice on scanned documents — and
segmented accuracy is precisely what you need before you reduce human review. **An option
that reports only an aggregate accuracy to justify reducing human review is wrong**, and
that sentence is an exam answer.

```python
report = evaluate(cases, extract)
# overall 0.97  <- the number the dashboard shows
# scanned/invoice_number 0.41  <- the number that matters
```

---

## 2. Lab — extraction + optimisation loop (the week's main build)

### 2.1 The build

```
extract/
├── extract.py        # forced-tool extraction + prefill fallback
├── evaluate.py       # segmented accuracy report
├── cases.json        # 30+ labelled documents across 4 doc types
└── optimize.py       # the change-one-thing loop
```

### 2.2 Two extraction paths, and knowing when each wins

```python
def extract_forced(document: str) -> dict:
    """Best for structured payloads. Guaranteed schema."""
    msg = client.messages.create(
        model=HAIKU, max_tokens=2048,          # extraction is not a reasoning task
        system=EXTRACT_SYSTEM, tools=[EXTRACT],
        tool_choice={"type": "tool", "name": "record_extraction"},
        messages=[{"role": "user", "content": document}],
    )
    if msg.stop_reason != "tool_use":
        raise ExtractionFailed(msg.stop_reason)
    return msg.content[0]["input"]


def extract_prefill(document: str) -> dict:
    """Best for flat, shallow fields. Cheaper, no tool round-trip."""
    msg = client.messages.create(
        model=HAIKU, max_tokens=512, system=EXTRACT_SYSTEM,
        messages=[{"role": "user", "content": document},
                  {"role": "assistant", "content": "{"}],
        stop_sequences=["}"],                   # close it ourselves
    )
    return json.loads("{" + msg.content[0]["text"])
```

### 2.3 The optimisation loop — the actual deliverable

```python
BASELINE = evaluate(cases, extract_forced)["overall"]

def optimize(candidates: list[tuple[str, str]]) -> list[tuple[str, float]]:
    """candidates: [(name, system_prompt)]. One variable at a time. Always."""
    results = [(f"baseline", BASELINE)]
    for name, system in candidates:
        saved = EXTRACT_SYSTEM
        try:
            globals()["EXTRACT_SYSTEM"] = system
            score = evaluate(cases, extract_forced)
            results.append((name, score["overall"]))
            print(f"{name:38} {score['overall']:.3f}  worst={score['worst_slice']}")
        finally:
            globals()["EXTRACT_SYSTEM"] = saved
    return sorted(results, key=lambda r: -r[1])
```

Run this over: baseline → +XML structure → +2 hard examples → +4 examples incl. ambiguous
→ +explicit escalation rules → model swap (Haiku → Sonnet). Print the table. **Keep the
change only if the worst slice improved**, not just the average.

### 2.4 A test that catches silent regressions

```python
def test_no_invented_currency():
    result = extract_forced("Invoice\nTotal: 49.00\n(no currency stated anywhere)")
    assert result["currency"] in ("USD", "EUR", "GBP", "JPY")
    assert result["confidence_known"] is False   # your schema must model uncertainty
```

Extraction bugs are rarely "it crashed". They are "it confidently returned a plausible
value for a field nobody could read", and only a labelled eval set finds that.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Same task with `tool_choice` auto / any / forced | `auto` is not "the model will probably call it" |
| 2 | Prefill `{` with no prefill; compare failure modes | Prefill removes a whole bug class |
| 3 | 2 examples vs 6 examples, including 3 ambiguous | Ambiguity is what examples teach |
| 4 | Enable thinking, then try to set `temperature` | The API enforces the constraint |
| 5 | Add a thinking turn, drop the thinking block on the follow-up | Context is state, not decoration |
| 6 | Break the segmentation in your eval; read the report | Aggregates hide the failure |
| 7 | Write 5 scenario questions about "how to enforce X" | Generating questions = understanding |

---

## 4. Deliverable — `extract/`

- [ ] Forced-tool extraction + prefill variant, with a documented rule for choosing between them
- [ ] ≥ 30 labelled cases across ≥ 4 document types
- [ ] `evaluate()` reporting per-doc-type × per-field slices and the worst slice
- [ ] `optimize()` run over ≥ 5 prompt variants, with a results table in the README
- [ ] One case that the model gets wrong, documented with your analysis of why
- [ ] A note on when you would *not* use extended thinking, with a measured comparison

---

## 5. Self-check

1. A payment step "must always require confirmation". Prompt or programmatic? Defend it.
2. What is the difference between `tool_choice: any` and `tool_choice: tool`?
3. Give two hard constraints on extended thinking, and the API error each one causes.
4. Your extraction suite reports 97 %. Name two things you would check before trusting it.
5. When is prefill a better answer than a forced tool?

---

## 6. Cheat sheet

| Need | Mechanism |
| --- | --- |
| Never skip a critical step | Programmatic gate, not a prompt |
| Force one specific tool | `tool_choice={"type":"tool","name":"…"}` |
| Force *some* tool, model picks | `tool_choice={"type":"any"}` |
| Forbid tools | `tool_choice={"type":"none"}` |
| Guaranteed flat object | Prefill the assistant turn |
| Guaranteed rich structure | Forced tool whose input is the schema |
| Consistent format | Prompt + 2–4 hard few-shot examples |
| Hard multi-step reasoning | Extended thinking (no temperature, budget < max_tokens) |
| Prove quality | Labelled eval, segmented, worst-slice reported |
