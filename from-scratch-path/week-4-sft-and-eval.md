---
title: "Week 4 — From Autocomplete to Assistant"
track: "scratch"
week: 4
order: 4
type: "module"
hours: 14
summary: "Supervised fine-tuning on instruction pairs, prompt-masked loss, sampling strategies, and honest evaluation of a model that is small and yours."
tags: ["sft", "instruction-tuning", "sampling", "evaluation", "perplexity"]
---

# Week 4 — From Autocomplete to Assistant

**Goal by Friday:** your pretrained model follows 20 instructions in a consistent format, and
you can state — with numbers and a list of failures — exactly how good it is.

**Set expectations now.** A 10–30M parameter model fine-tuned on 4,000 instruction pairs will
be *worse than any downloaded chat model*. It will answer simple questions, sometimes, in the
right shape. That is a complete success for this course, because you built every part of it.

---

## 1. Concepts (90 min)

### 1.1 Pretraining vs SFT

| | Pretraining | SFT (supervised fine-tuning) |
| --- | --- | --- |
| Data | Raw text, billions of tokens | Prompt/response pairs, thousands |
| Objective | Predict the next token, everywhere | Predict the next token **in the response only** |
| Teaches | Language, facts, patterns | Format, task-following, tone |
| Cost | Hours to months | Minutes to an hour |

SFT is the same loss as pretraining, applied to a narrower distribution. There is nothing new
in the maths — only in the data and the masking.

### 1.2 Prompt masking: the one implementation detail that matters

If you compute loss over the prompt too, the model spends capacity learning to reproduce your
questions. Mask it out:

```python
# labels: prompt tokens -> -100, response tokens -> the real ids
# PyTorch's cross_entropy ignores index -100 by default
labels = [-100] * len(prompt_ids) + response_ids
```

This is why `F.cross_entropy(..., ignore_index=-100)` appears in every trainer you will ever
read.

### 1.3 The format you train is the format you get

Pick one serialization and use it everywhere — in training, in evaluation, in your demo app:

```
### Instruction:
Classify this ticket: "Export fails on Safari"

### Response:
{"category": "bug", "urgency": "high"}
```

If your app sends a system prompt at inference that never appeared in training, the model sees
an out-of-distribution input and behaves unpredictably. Consistency is free accuracy.

### 1.4 Sampling: the knobs that change everything

| Setting | Effect | When |
| --- | --- | --- |
| `temperature 0` (greedy) | Deterministic, repetitive | Classification, extraction |
| `temperature 0.7–0.9` | Natural, varied | Chat, creative writing |
| `top_k 40` | Sample from the 40 best tokens | General safety |
| `top_p 0.95` | Sample from the smallest set covering 95 % probability | Usually better than top_k |
| repetition penalty | Discourages loops | Small models, long outputs |

Small models loop. If your output repeats a phrase, the fix is usually `top_p` plus a
repetition penalty — not more training.

### 1.5 Evaluation: two numbers, not one

**Perplexity** (`exp(loss)`) measures how unsurprised the model is by held-out text. It is a
*fluency* metric. It says nothing about whether the model did the task.

**Task accuracy** measures what you actually care about:

```python
def exact_match(pred: str, gold: str) -> bool:
    return norm(pred) == norm(gold)   # norm = lowercase, strip, collapse whitespace
```

Report both. A model can improve perplexity while getting worse at your task — that is
overfitting to the corpus's style, and it is the most common way small-model projects
mislead themselves.

### 1.6 Catastrophic forgetting, measured

SFT narrows the model. After 3 epochs on ticket classification, ask your model to tell a story.
It may have lost the ability. Quantify it:

| Prompt type | Before SFT | After SFT |
| --- | --- | --- |
| Your task (20 cases) | 12 % | **85 %** |
| Open-ended generation (5 stories) | coherent | repetitive, off-topic |
| Simple arithmetic (10 sums) | 20 % | 10 % |

Then decide: is the trade worth it? For a single-purpose model, usually yes. For a general
assistant, you need to mix some pretraining data into the SFT set (a "replay" ratio of 5–10 %
works surprisingly well).

---

## 2. Lab — teach it to follow instructions (5 h)

### 2.1 Build 2,000–5,000 instruction pairs

Sources, in order of usefulness:

1. **Your own task data**, reformatted as instruction/response (best — it is in distribution).
2. **A small public set**: Alpaca-style, Dolly, or a domain subset of OpenAssistant.
3. **Synthetic from a bigger model**: generate 2,000 examples with a hosted model, then filter
   aggressively. Cheap and effective — but check the licence and never train on outputs you
   have not read.

```jsonl
{"instruction": "Classify this ticket: Export fails on Safari", "response": "{\"category\": \"bug\", \"urgency\": \"high\"}"}
{"instruction": "Summarise in one sentence: The deploy failed because the config key was missing.", "response": "The deploy failed due to a missing config key."}
```

Rules from Week 2 still apply: one voice, exact format, no contradictions, 10 % held out.

### 2.2 Tokenize with masked labels

```python
def encode_example(ex, tokenizer, block_size=256):
    prompt = f"### Instruction:\n{ex['instruction']}\n\n### Response:\n"
    answer = ex["response"] + tokenizer.eos_token
    p_ids = tokenizer.encode(prompt, add_special_tokens=False)
    a_ids = tokenizer.encode(answer, add_special_tokens=False)
    ids = (p_ids + a_ids)[:block_size]
    labels = ([-100] * len(p_ids) + a_ids)[:block_size]
    return ids, labels


def collate(batch, pad_id=50256):
    maxlen = max(len(x) for x, _ in batch)
    X = torch.full((len(batch), maxlen), pad_id, dtype=torch.long)
    Y = torch.full((len(batch), maxlen), -100, dtype=torch.long)
    for i, (ids, labels) in enumerate(batch):
        X[i, :len(ids)] = torch.tensor(ids)
        Y[i, :len(labels)] = torch.tensor(labels)
    return X, Y
```

Note `pad_id` in `X` is harmless (attention ignores nothing, but the loss ignores those
positions via `-100` in `Y`). Padding the *labels* with `-100` is the part that matters.

### 2.3 Fine-tune from your checkpoint

```python
model.load_state_dict(torch.load("ckpt_best.pt")["model"])
opt = torch.optim.AdamW(model.parameters(), lr=1e-4)   # 5-10x lower than pretraining

for step in range(1500):
    x, y = collate([encode_example(e) for e in random.sample(sft_train, 8)])
    logits, _ = model(x.to(device))
    loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.to(device).view(-1),
                           ignore_index=-100)
    opt.zero_grad(set_to_none=True)
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step()
```

Learning rate **1e-4, not 6e-4**. SFT on a pretrained model is a gentle nudge; a big LR wipes
out what pretraining bought.

Watch for loss going to ~0.3 in 100 steps on a small set: that is memorisation. Stop, add data.

### 2.4 Evaluate honestly

```python
def run_eval(model, cases, max_new=80):
    hits, rows = 0, []
    for case in cases:
        prompt = f"### Instruction:\n{case['instruction']}\n\n### Response:\n"
        ids = torch.tensor([tokenizer.encode(prompt)], device=device)
        out = model.generate(ids, max_new_tokens=max_new, temperature=0.0)
        text = tokenizer.decode(out[0, ids.shape[1]:].tolist())
        ok = case["response"].strip()[:40].lower() in text.lower()
        hits += ok
        rows.append({"instruction": case["instruction"], "got": text[:160], "ok": ok})
    return hits / len(cases), rows
```

Report three numbers, always:

| Metric | Before SFT | After SFT |
| --- | --- | --- |
| Task exact / contains match (30 cases) | ? | ? |
| Perplexity on held-out SFT responses | ? | ? |
| Open-ended coherence (your 1–5 judgement, 5 samples) | ? | ? |

### 2.5 Compare against a downloaded model — and be at peace

Run the same 30 cases through a 3B instruct model. It will win. Write the comparison down
anyway:

| model | params | task score | trained by |
| --- | --- | --- | --- |
| your-gpt | 10.6M | 62 % | you, 3 hours |
| Qwen2.5-1.5B-Instruct | 1.5B | 91 % | a lab, thousands of GPUs |

The ratio is the lesson: **140× the parameters, and 30 points.** That gap is what pretraining
scale buys, and it is exactly why fine-tuning an existing model is the right move for real
work — and why understanding both is rare and valuable.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | SFT without prompt masking | The model learns to write your questions |
| 2 | SFT at LR 6e-4 | Catastrophic forgetting in one run |
| 3 | Eval at temperature 0 vs 0.9 | Why benchmarks pin temperature |
| 4 | Add 10 % pretraining text to the SFT mix | Replay, and how cheaply it works |
| 5 | Ask 10 questions outside the task | What "narrow" really means |
| 6 | Serve it with `llama.cpp` after GGUF conversion | The whole pipeline, end to end |

---

## 4. Deliverable — `gpt-tiny-instruct` on GitHub

- [ ] `sft.py` with prompt masking and padding handled correctly
- [ ] `data/sft_train.jsonl` and `data/sft_eval.jsonl` (10 % held out, no leakage)
- [ ] `eval.py` printing task score, perplexity, and a failures table
- [ ] `MODEL_CARD.md` — base checkpoint, data, scores, and **known failures**
- [ ] `samples/` — 10 task answers and 3 open-ended generations
- [ ] `compare.md` — your model vs a downloaded one, same cases, same scoring
- [ ] GGUF export (optional but encouraged) and a one-line run command

**Interview question this earns you:** *"Why is perplexity not enough?"* — "It measures fluency
on held-out text. A model can get better perplexity by imitating the corpus's style while
getting worse at the task, so I always pair it with a task-level accuracy on labelled cases."

---

## 5. Self-check

1. Why mask the prompt tokens out of the loss?
2. Why is the SFT learning rate lower than the pretraining rate?
3. What is catastrophic forgetting, and how do you measure it?
4. Temperature 0 vs 0.8: which do you use to benchmark, and why?
5. Your loss drops to 0.25 in 80 steps. What is happening?
6. Name two things a 1.5B pretrained model has that your 10M model cannot get from SFT.

---

## 6. Cheat sheet

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Model repeats the instruction back | Prompt not masked | `-100` on prompt labels |
| Loss ~0.2 instantly | Memorising a tiny SFT set | More data, fewer steps |
| Output format drifts | Training format ≠ inference format | Make the template identical |
| Loops a phrase forever | Small model, greedy decoding | `top_p 0.95`, repetition penalty |
| Everything it learned before is gone | LR too high, too many epochs | LR 1e-4, 1–2 epochs, 5–10 % replay |
| Task score up, perplexity worse | Overfit to format, not language | Add replay data, evaluate both |
