---
title: "Week 2 — Data Is 80 % of the Job"
track: "finetune"
week: 2
order: 2
type: "module"
hours: 14
summary: "Chat templates, the JSONL formats trainers accept, how many examples you really need, quality rules, dedup, leakage, and a validation script that catches mistakes before training does."
tags: ["datasets", "jsonl", "chat-template", "quality", "licensing", "splits"]
---

# Week 2 — Data Is 80 % of the Job

**Goal by Friday:** `data/train.jsonl` and `data/valid.jsonl`, 300–800 examples, machine
validated, deduplicated, provably disjoint from your eval set, with a stats report showing
token lengths and label balance.

A fine-tune is a mirror. Put inconsistent examples in, get an inconsistent model out — and no
hyperparameter will save you.

---

## 1. Concepts (90 min)

### 1.1 The chat template: the model's native format

Instruction models were trained on a specific serialization with special tokens:

```
<|im_start|>system
You classify support tickets.<|im_end|>
<|im_start|>user
Export fails on Safari<|im_end|>
<|im_start|>assistant
{"category": "bug", "urgency": "high"}<|im_end|>
```

Get this wrong and the model learns to imitate noise. **Never hand-write the template.**
Every tokenizer carries it:

```python
from transformers import AutoTokenizer

tok = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-7B-Instruct")
messages = [
    {"role": "system", "content": "You classify support tickets. Reply with JSON only."},
    {"role": "user", "content": "Export fails on Safari"},
    {"role": "assistant", "content": '{"category": "bug", "urgency": "high"}'},
]
print(tok.apply_chat_template(messages, tokenize=False))
```

Run that once for your chosen model and look at the output. That text is what the trainer
feeds in, and `mlx-lm` / TRL both call the same method for you.

### 1.2 The JSONL shape trainers want

**mlx-lm** accepts `messages`:

```json
{"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
```

and also a simpler `prompt`/`completion` pair:

```json
{"prompt": "Ticket: Export fails on Safari\nJSON:", "completion": "{\"category\": \"bug\", \"urgency\": \"high\"}"}
```

**TRL / Unsloth** use a Hugging Face `Dataset` with either a `messages` column (conversational)
or `text` (pre-templated). Conversational is the one to prefer:

```python
from datasets import load_dataset
ds = load_dataset("json", data_files="data/train.jsonl", split="train")
# ds[0]["messages"] -> list of {"role", "content"}
```

One JSON object per line. No trailing commas. No array wrapping. UTF-8, no BOM.

### 1.3 How many examples?

| Examples | What you get |
| --- | --- |
| 20–50 | Memorisation. It recites your examples and fails on anything new. |
| 100–300 | Enough for a narrow format/label task. Start here. |
| 300–1,000 | The sweet spot for style, classification, tool calling. |
| 1,000–10,000 | Diminishing returns unless the task is genuinely broad. |

The honest heuristic: **you need enough to cover the input space, and enough that the model
sees each pattern ~3–5 times across epochs.** 300 well-varied examples beat 3,000 near-copies
every time, because near-copies teach memorisation.

### 1.4 The quality rules that matter more than quantity

1. **One voice.** Every assistant turn written in the same style, same length band, same
   vocabulary. Mixed authors = a model with a personality disorder.
2. **The output you actually want.** Not "a good answer" — the *exact* shape. If production
   needs `{"category": "bug"}` with no prose, every example has exactly that, no fences, no
   "Sure!".
3. **Diverse inputs.** Vary length, casing, typos, languages, and the boring cases. A dataset
   of 400 angry tickets produces a model that only handles angry tickets.
4. **No contradictions.** Two examples where identical input gets different labels will both
   be learned, badly. Resolve them.
5. **Trim the fat.** If 40 % of your examples are the same copy-pasted template with one word
   swapped, delete 90 % of them.
6. **Include refusals.** If the right answer is sometimes "I can't help with that", those
   examples must exist, or the model will invent an answer instead.

### 1.5 Splits, leakage, and the trap

| Split | Share | Purpose |
| --- | --- | --- |
| `train.jsonl` | ~90 % | What the model learns from |
| `valid.jsonl` | ~10 % | Validation loss during training; detects overfitting |
| `eval/cases.jsonl` | separate | Your Week-1 benchmark — never trained on, never validated on |

**Leakage** is when an eval question (or a near-duplicate) appears in training. Then your score
measures recall of a memorised answer. Guard against it mechanically:

```python
# Near-duplicate check: normalized token overlap, not exact string match
import re
def norm(s: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", s.lower()))

def jaccard(a: str, b: str) -> float:
    A, B = norm(a), norm(b)
    return len(A & B) / max(1, len(A | B))

leaks = [(t, e) for t in train_inputs for e in eval_inputs if jaccard(t, e) > 0.8]
print(f"{len(leaks)} suspicious overlaps")   # investigate every one above 0.8
```

### 1.6 Licensing, honestly

You inherit the base model's licence, and it often reaches your adapter.

- **Apache-2.0 / MIT bases** (many Qwen, Mistral, Phi): commercial use is fine; keep the notice.
- **Llama community licence:** gated on the Hub — accept it with your own account — plus
  attribution and an acceptable-use policy. Read it before you ship.
- **Gemma:** its own terms; check them for your use case.
- **Your data:** do you have the right to train on those tickets, emails, or chats? Strip
  personal data. A support-ticket dataset with customer names in it is a liability, not an
  asset.

---

## 2. Lab — build and validate the dataset (5 h)

### 2.1 Collect and normalize

Write `scripts/build_dataset.py` that reads your raw source (a CSV export, a folder of
markdown, a Slack dump) and emits the JSONL. Keep the raw file untouched — it is the audit
trail.

```python
"""Turn raw source rows into chat-format JSONL. Deterministic: same input, same output."""
import json, csv
from pathlib import Path

SYSTEM = ("You classify support tickets. Reply with JSON only, no prose: "
          '{"category": "billing|bug|feature", "urgency": "low|med|high"}')

def to_messages(ticket: str, category: str, urgency: str) -> dict:
    answer = json.dumps({"category": category, "urgency": urgency})
    return {"messages": [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": ticket.strip()},
        {"role": "assistant", "content": answer},
    ]}

rows = list(csv.DictReader(Path("raw/tickets.csv").open()))
out = [to_messages(r["body"], r["category"], r["urgency"]) for r in rows]
Path("data").mkdir(exist_ok=True)
Path("data/all.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in out))
print(f"wrote {len(out)} examples")
```

### 2.2 Validate before you train (`scripts/validate_dataset.py`)

This catches 90 % of the mistakes that waste a training run:

```python
"""Fail loudly on bad data. Run this before every training run."""
import json, statistics
from collections import Counter
from pathlib import Path

REQUIRED_ROLES = ["user", "assistant"]

def check(path: Path) -> list[dict]:
    problems, rows = [], []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as e:
            problems.append(f"line {i}: invalid JSON ({e})")
            continue
        msgs = row.get("messages") or []
        roles = [m.get("role") for m in msgs]
        if not msgs:
            problems.append(f"line {i}: no messages")
        if roles.count("assistant") != 1:
            problems.append(f"line {i}: expected exactly one assistant turn, got {roles.count('assistant')}")
        if "user" not in roles:
            problems.append(f"line {i}: no user turn")
        if msgs and (not msgs[-1].get("content") or not msgs[-1].get("content").strip()):
            problems.append(f"line {i}: empty assistant answer")
        rows.append(row)
    return problems, rows

for name in ("data/train.jsonl", "data/valid.jsonl"):
    problems, rows = check(Path(name))
    words = [len(json.dumps(r).split()) for r in rows]
    print(f"{name}: {len(rows)} rows, median {statistics.median(words):.0f} words")
    for p in problems[:20]:
        print("  !", p)
    if problems:
        raise SystemExit(f"{len(problems)} problem(s) in {name}")
```

### 2.3 Check the balance

```python
labels = Counter(json.loads(json.loads(l)["messages"][-1]["content"])["category"]
                 for l in Path("data/train.jsonl").read_text().splitlines() if l.strip())
print(labels)
# Counter({'bug': 412, 'billing': 9, 'feature': 4})
```

That output is a warning. A model trained on it will answer "bug" to everything, and it will
score 80 % on a benchmark that is also 80 % bugs. Either collect more of the rare classes, or
deliberately **downsample** the majority class.

### 2.4 Split, deterministically

```python
import random, json
from pathlib import Path

rows = [l for l in Path("data/all.jsonl").read_text().splitlines() if l.strip()]
random.Random(42).shuffle(rows)          # seed = reproducible splits
cut = int(len(rows) * 0.9)
Path("data/train.jsonl").write_text("\n".join(rows[:cut]))
Path("data/valid.jsonl").write_text("\n".join(rows[cut:]))
print(f"train {cut}, valid {len(rows) - cut}")
```

### 2.5 Eyeball ten examples out loud

Print ten random training rows and read them as if you were the model. Ask:

- Is the answer something I would be happy to receive in production?
- Is the format byte-identical across all ten?
- Would a human reviewer know what to do with the input alone?

If any answer is "no", fix the data. Not the hyperparameters. Never the hyperparameters.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Train on 50 examples only, then 300, then all | The actual shape of the data/size curve |
| 2 | Deliberately add 20 inconsistent labels, then train | How fast bad data destroys a run |
| 3 | Duplicate 50 % of the dataset and re-run | Why more isn't better |
| 4 | Print token lengths; find the 95th percentile | Which examples will be truncated by `max_seq_length` |
| 5 | Compute the Jaccard leak check against eval | Leakage is measurable, not hypothetical |
| 6 | Strip names/emails with a regex and diff the count | What PII removal actually costs you |

---

## 4. Deliverable — `ft-data` on GitHub

- [ ] `scripts/build_dataset.py` — raw source → `data/all.jsonl`, deterministic
- [ ] `scripts/validate_dataset.py` — exits non-zero on any structural problem
- [ ] `data/train.jsonl`, `data/valid.jsonl` — 300–800 examples, seed-42 split
- [ ] `data/STATS.md` — row counts, label balance, token-length percentiles, leak-check result
- [ ] `data/README.md` — where the data came from, what was removed, and the licence
- [ ] `eval/cases.jsonl` unchanged from Week 1 and provably excluded

**Interview question this earns you:** *"How do you stop a fine-tune from just memorising?"*
— "Small, diverse, deduplicated data; a held-out eval written before training; and a
validation split that I actually watch instead of ignoring."

---

## 5. Self-check

1. What is a chat template and why must you never hand-write it?
2. Why is `valid.jsonl` separate from `eval/cases.jsonl`?
3. Your dataset is 92 % one class. Name two consequences.
4. Give three rules that make an example "high quality".
5. You have 40 examples that are all one template with one word swapped. What do you do?
6. Whose licence governs the model you produce?

---

## 6. Cheat sheet

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Loss goes to ~0 in 20 steps | Tiny dataset, memorisation | More diverse data, fewer epochs |
| Model outputs prose around the JSON | Some training answers had prose | Rebuild targets, byte-identical format |
| Model ignores one label entirely | Class imbalance | Downsample majority, or collect more of the rare class |
| Validation loss rises while train falls | Overfitting | Fewer iterations, more data, lower rank |
| Trainer errors on `messages` key | Wrong format for that trainer | `prompt`/`completion` for mlx-lm, `messages` for TRL |
| Truncated answers | `max_seq_length` too small | Measure the 95th percentile; raise it or shorten examples |
