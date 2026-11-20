---
title: "Week 1 — What Fine-Tuning Actually Is"
track: "finetune"
week: 1
order: 1
type: "module"
hours: 12
summary: "Behaviour vs knowledge, LoRA and QLoRA without the maths, the file-format trap, choosing a base model, and building the 50-case eval set that judges every later run."
tags: ["fundamentals", "lora", "qlora", "gguf", "evaluation", "baseline"]
---

# Week 1 — What Fine-Tuning Actually Is

**Goal by Friday:** a working baseline number. You have picked a base model, run it on 50
cases of your own task, scored it with a script, and saved that score. Every change in the
next three weeks is measured against it.

---

## 1. Concepts (90 min)

### 1.1 The three ways to change a model's behaviour

| Lever | What it changes | Cost | Reversible? |
| --- | --- | --- | --- |
| **Prompting** | What the model attends to right now | Free | Instantly |
| **RAG** | What facts are in the context window | Cheap, ongoing | Yes |
| **Fine-tuning** | The weights — how it responds | One-off hours/GPU | Yes (keep the adapter) |

Always exhaust the first two before the third. If a better prompt plus three examples gets
you 80 % of the way, you do not have a fine-tuning problem.

### 1.2 What a fine-tune can and cannot learn

**Can learn (behaviour):**
- output format — always this JSON shape, always this markdown structure
- tone and register — terse, formal, no exclamation marks, house style
- classification — "which of my 14 categories is this ticket?"
- tool-call discipline — when to call `lookup_order`, with which arguments
- domain shorthand — internal acronyms and their expansions

**Cannot learn (knowledge):**
- today's inventory, prices, or ticket status
- a 400-page PDF you fed it once
- new facts introduced after training

Why: 600 examples nudges a small number of weights. Facts need either to be in the weights
*before* training (pretraining, billions of tokens) or in the context at inference (RAG).

### 1.3 LoRA, precisely enough

A linear layer computes `y = W·x`. LoRA adds a low-rank correction:

```python
# Conceptual — the real implementation lives in the trainer
y = W @ x + (B @ A) @ x * (alpha / rank)
# W: frozen, d×d          A: d×r, random init
# B: r×d, zero init       rank r = 8..64
```

Two facts that matter in practice:

1. **`B` starts at zero**, so at step 0 the model is *identical* to the base model. Your
   fine-tune can only make it worse by training too long — not by starting.
2. **The adapter is tiny.** A rank-16 adapter on a 7B model is ~40–80 MB. You can keep five
   of them and swap per task, all on one base model.

**QLoRA** = the frozen `W` stored in 4-bit while `A` and `B` train in 16-bit. Same interface,
~4× less memory, a small quality cost. On consumer hardware, this is the default.

### 1.4 The file-format trap (read this twice)

| Format | What it is | Can you train it? |
| --- | --- | --- |
| **safetensors** (HF repo) | Full-precision weights, the training format | **Yes** |
| **GGUF** | Quantized, packed for llama.cpp inference | No — go back to the original repo |
| **MLX** (4-bit/8-bit) | Apple-silicon inference format | Yes, via QLoRA (mlx-lm reads it) |
| **LoRA adapter** | A small patch, useless without its exact base | It *is* the output |

So: **train on safetensors (or MLX on a Mac), ship as GGUF.** If the only thing you have
downloaded is a GGUF from LM Studio's search, that is not your training starting point.

### 1.5 Choosing a base model

| Model | Why pick it |
| --- | --- |
| **Qwen2.5-7B-Instruct** | Strong, permissive licence, excellent chat template, huge ecosystem |
| **Llama 3.1-8B-Instruct** | Most tutorials; gated licence, must accept it on the Hub |
| **Gemma 3 4B / 12B** | Small and good; check the Gemma licence terms |
| **Phi-4-mini** | Excellent at 4B for reasoning-ish tasks on modest hardware |
| **FunctionGemma 270M** | Tiny, purpose-built for tool calling — a great first run |

Rules of thumb:
- **Instruct/base variant:** start from the *instruct* model. You want to change behaviour,
  not teach it to follow instructions from zero.
- **Size:** the smallest model that can do the task. A well-tuned 3B often beats a badly
  tuned 14B, and it trains in a tenth of the time.
- **Same family as your inference runtime:** anything llama.cpp supports is safe.

---

## 2. Lab — meet the base model, then build its judge (3 h)

### 2.1 Run the base model first

```bash
# Mac
mlx_lm.generate --model mlx-community/Qwen2.5-7B-Instruct-4bit \
  --prompt "Classify this support ticket as billing, bug, or feature: 'Export fails on Safari'"

# or in LM Studio
lms get qwen2.5-7b-instruct
```

Ask it your real task five times. Note what it does wrong: wrong label names, extra prose
around the JSON, an apologetic preamble. **Those failures are your training targets.**

### 2.2 Define the task in one sentence

Write this down before anything else:

> *"Given a support ticket, output JSON `{"category": "...", "urgency": "low|med|high"}` and
> nothing else."*

If you cannot write one sentence, you are not ready to fine-tune.

### 2.3 The eval set: 50 cases, hand-labelled

Create `eval/cases.jsonl`. One JSON object per line:

```json
{"input": "Export fails on Safari", "expected": {"category": "bug", "urgency": "high"}}
{"input": "How do I change my card?", "expected": {"category": "billing", "urgency": "low"}}
```

Rules:
- **50 minimum, 80 is comfortable.** Every case is real or realistic.
- **Include the boring middle**, not just hard cases. 30 easy + 15 medium + 5 nasty.
- **Label before you train**, never after. Labels written afterwards are contaminated by
  knowing what your model said.
- **Never put eval cases in your training data.** This is the single most common way people
  fool themselves.

### 2.4 The scoring script (`eval/score.py`)

```python
"""Score any model endpoint against eval/cases.jsonl. Works with any OpenAI-compatible
server (LM Studio :1234, llama.cpp, vLLM, Ollama /v1)."""
import json, re, sys
from pathlib import Path
from openai import OpenAI

client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio")
MODEL = sys.argv[1] if len(sys.argv) > 1 else "local-model"

SYSTEM = ("You classify support tickets. Reply with JSON only: "
          '{"category": "billing|bug|feature", "urgency": "low|med|high"}')

def parse(text: str):
    """Models wrap JSON in prose or fences. Be forgiving when parsing,
    strict when scoring — otherwise you measure formatting luck."""
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None

cases = [json.loads(line) for line in Path("eval/cases.jsonl").read_text().splitlines() if line.strip()]
correct = 0
failures = []
for case in cases:
    reply = client.chat.completions.create(
        model=MODEL, temperature=0.0, max_tokens=120,
        messages=[{"role": "system", "content": SYSTEM},
                  {"role": "user", "content": case["input"]}],
    ).choices[0].message.content or ""
    got = parse(reply)
    ok = got is not None and all(got.get(k) == v for k, v in case["expected"].items())
    correct += ok
    if not ok:
        failures.append({"input": case["input"], "expected": case["expected"], "got": got, "raw": reply[:200]})

print(f"{MODEL}: {correct}/{len(cases)} = {correct / len(cases):.1%}")
Path("eval/failures.json").write_text(json.dumps(failures, indent=2))
print("wrote eval/failures.json — read it, it is the most useful file you own")
```

Run it against the base model and **save the output**:

```bash
pip install openai
python eval/score.py qwen2.5-7b-instruct | tee eval/baseline.txt
```

Expect 30–60 %. That is a normal baseline for a task the model was not tuned for. Write the
number in a `RESULTS.md` you will keep updating.

> **Why this matters more than training.** Training is 20 minutes of waiting. Evaluation is
> the only thing that tells you whether the 20 minutes helped. People who skip this step
> "fine-tune" a model into being worse at their own task and never find out.

### 2.5 The cheapest possible baseline (30 min)

Before LoRA, spend 30 minutes proving prompting is not enough:

- Put 3 worked examples in the system prompt (few-shot).
- Re-score. If you jump to ~90 %, **stop** — you do not need this course, you need a better
  prompt, and you just saved three weeks.
- Most tasks do not jump that far. Format adherence, long-tail labels, and tone usually
  plateau around 60–75 % that way — that gap is what fine-tuning buys.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Score the base model at temperature 0 and 0.8 | Temperature silently changes your benchmark |
| 2 | Score it with a deliberately vague system prompt | How much of "the model is bad" is actually "the prompt is bad" |
| 3 | Log token counts per request; multiply by your price or your wattage | What this task costs at 10k requests/day |
| 4 | Ask it 3 questions **outside** the task (a fact, a sum, today's date) | Weights do not hold fresh facts — the reason RAG exists |
| 5 | Open your eval failures file and group the 10 worst by *type* | Turns "it's bad" into a list of fixable defects |

---

## 4. Deliverable — `ft-baseline` on GitHub

- [ ] `task.md` — the one-sentence task definition
- [ ] `eval/cases.jsonl` — ≥ 50 labelled cases, split easy/medium/hard in the tags
- [ ] `eval/score.py` — parses generously, scores strictly
- [ ] `eval/baseline.txt` — the base-model score, zero-shot and few-shot
- [ ] `RESULTS.md` — a table with the baseline rows and an empty column waiting for your adapter
- [ ] A short note listing the top 3 failure modes you observed

**Interview question this earns you:** *"How do you know your fine-tune helped?"* — "I wrote
the eval before I trained, kept the labels away from the training data, and compared on the
same 50 cases at temperature 0."

---

## 5. Self-check

1. Name two things fine-tuning fixes and two things it cannot.
2. Why can't you fine-tune the GGUF you downloaded in LM Studio?
3. Why does LoRA start from *exactly* the base model's behaviour at step 0?
4. What is the difference between QLoRA and LoRA in one sentence?
5. Your eval says 88 % but real users complain. Give two possible reasons. (Start: your eval
   cases are not representative; or your scorer is forgiving in a way users are not.)

---

## 6. Cheat sheet

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "No LM Runtime found for model format 'safetensors'" | You pointed an inference app at training weights | Convert to GGUF, or use LM Studio's MLX path on Apple Silicon |
| Base model scores 0 % | Output format not parsed / wrong label names | Check `raw` in `failures.json` first — usually formatting, not intelligence |
| Few-shot prompting already scores 92 % | No fine-tuning needed | Ship the prompt |
| Adapter file is 40 MB but "the model" is 4 GB | Correct — adapters are tiny patches | Keep the exact base path recorded next to the adapter |
| Training data has your eval answers in it | Leakage | Dedup and filter before Week 2 ends |
