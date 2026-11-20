---
title: "Projects & Capstone"
track: "finetune"
week: 4
order: 5
type: "project"
hours: 12
summary: "Three portfolio-grade fine-tunes and a capstone that ends with a published adapter, a measured improvement, and a model card you can defend."
tags: ["projects", "portfolio", "capstone", "model-card", "interview"]
---

# Projects & Capstone

Three builds, each teaching a different lesson, then one capstone you actually publish.

---

## Project A — `format-enforcer` (Week 1–2) — *the easy win*

**What it is:** a fine-tune whose only job is output shape. Take any task where the base model
wraps JSON in prose, and make it emit exactly the schema, every time.

**Why it matters:** it is the most common real use of fine-tuning, it works with 150 examples,
and it gives you a clean before/after number in a day.

**Scope:**

- [ ] 150–300 examples of input → exact JSON, no prose, no fences
- [ ] Eval scoring *parsed* field equality, not string similarity
- [ ] Baseline vs adapter vs Q4 GGUF, three scores
- [ ] A schema-validated serving wrapper (pydantic) that rejects malformed output

**Stretch:** add a second output schema and train one adapter that switches on a system-prompt
flag. Demonstrates format conditioning, not just format.

---

## Project B — `house-style` (Week 2–3) — *the taste test*

**What it is:** a model that writes in a specific voice — your company's release notes, your
documentation tone, your review comment style.

**Why it matters:** style is where fine-tuning beats prompting, and where evaluation needs
human judgement. Learning to measure a subjective quality is a senior skill.

**Scope:**

- [ ] 300–600 examples of real text in the target voice
- [ ] Eval with **two** measures: a rubric scored by a stronger model, plus a pairwise
      preference test (base vs tuned, 40 pairs, blinded)
- [ ] A report: win/tie/loss counts, not just a percentage
- [ ] A documented failure mode list (what it gets wrong that the base model got right)

**Stretch:** train two adapters on two voices and build a switch, proving adapters are cheap
and composable.

---

## Project C — `tool-caller` (Week 3–4) — *the practical one*

**What it is:** a small model that reliably calls your 5–10 functions with correct arguments,
including the hard cases: missing arguments, ambiguous requests, and requests that need no
tool at all.

**Why it matters:** tool-call discipline is the highest-value narrow behaviour in production
systems, and small fine-tuned models can beat much larger general models at it.

**Scope:**

- [ ] A tool schema set you actually use (5–10 functions, typed)
- [ ] 400+ examples: single call, multi-call, no-call, ambiguous, and refusal
- [ ] Eval on: correct tool chosen, arguments exact, no spurious calls
- [ ] A bounded agent loop consuming your model via an OpenAI-compatible endpoint
- [ ] Latency and tokens/call measured against the base model

**Stretch:** fine-tune the tiny FunctionGemma 270M and compare it to a 7B. The result is
usually surprising and always a good story.

---

## Capstone — *"Publish a model"*

One model, published, with a number attached. Not a notebook — a release.

**Day by day:**

| Day | Focus | Exit criterion |
| --- | --- | --- |
| 1 | Scope + eval | 50 labelled cases, baseline scored, task in one sentence |
| 2 | Data | 300+ validated examples, no leakage, balance checked |
| 3 | Train | Adapter trained, best checkpoint chosen on validation loss |
| 4 | Evaluate | Before/after + regression set + one overfit run for comparison |
| 5 | Ship | Fused, quantized, imported into LM Studio, model card published |

**Definition of done (all must be true):**

- [ ] Someone else can reproduce your eval number from the repo alone
- [ ] The model card states weaknesses and out-of-scope uses
- [ ] You have a signed-off baseline, not a remembered one
- [ ] You know the quantization cost for your task
- [ ] You can explain every hyperparameter you chose and why
- [ ] You have a list of 20 real prompts that still fail — your next dataset
- [ ] The adapter, the GGUF, or both are downloadable by a stranger

---

## Portfolio polish

1. **One-line hook with the number:** *"Support-ticket classifier: 46 % → 93 % exact-match on
   50 cases, 620 examples, 22 minutes on an M4 laptop. Q4 GGUF runs in LM Studio."*
2. **The results table** — every run, including the ones that failed.
3. **The loss curve** — a pasted log or a small chart, with the chosen checkpoint marked.
4. **The model card** — weaknesses first. It reads as confidence, not insecurity.
5. **Reproduce section** — three commands: install, train, eval.

---

## The interview script you are building toward

1. *"Walk me through a fine-tune you did."* → task, data, method, numbers, what you would do
   differently.
2. *"Why LoRA instead of full fine-tuning?"* → memory, cost, adapters are swappable, quality
   is within a couple of points for behaviour changes.
3. *"How do you know it isn't just memorising?"* → held-out eval, validation curve, overfit
   run as a control.
4. *"When would you use RAG instead?"* → any time the answer depends on facts that change.
5. *"What did you break?"* → the regression set, quantified. This answer is the one that gets
   you hired.
