---
title: "Week 3 — Your First Training Run"
track: "finetune"
week: 3
order: 3
type: "module"
hours: 14
summary: "A complete LoRA run with mlx-lm or Unsloth: the five hyperparameters that matter, reading a loss curve, fighting overfitting, and fitting the job into your memory."
tags: ["training", "mlx", "unsloth", "hyperparameters", "loss-curve", "vram"]
---

# Week 3 — Your First Training Run

**Goal by Friday:** a finished adapter, a loss curve you can explain, and the eval score of
your fine-tuned model next to the Week-1 baseline.

The run itself takes 10–40 minutes. Understanding what the curve is telling you takes the rest
of the week — and it is the difference between a model and a random number generator.

---

## 1. Concepts (90 min)

### 1.1 The five knobs that matter

| Knob | Typical | What it does | Bad values look like |
| --- | --- | --- | --- |
| **iterations** | 300–1,000 | Gradient steps | 5,000 → memorises; 50 → learns nothing |
| **learning rate** | 1e-4 to 2e-4 | Step size | 1e-3 → loss spikes, garbage; 1e-6 → nothing happens |
| **rank (`r`)** | 8–32 | Adapter capacity | 128 → overfits and bloats; 4 → cannot hold the task |
| **`num-layers`** | 8–16 | How many layers get adapters | 32 → more memory, marginal gain |
| **batch size** | 1–4 | Examples per step | Too high → OOM; too low → noisy curve |

Everything else is second-order. Do not touch the rest until these five are sane.

### 1.2 Reading the loss curve (the skill of the week)

```
loss
 2.4 |*
 1.8 | **
 1.2 |   ***
 0.7 |      ****
 0.4 |          ***********          <- train keeps falling
 0.2 |                     ********
     +-------------------------------
       train loss   ····  valid loss
 1.6 |········
 1.3 |········  ········
 1.1 |                ········        <- valid flattens then rises
 1.2 |                        ········
     +-------------------------------
     step 0        400        800
```

| Pattern | Meaning | Action |
| --- | --- | --- |
| Both fall, smoothly | Learning | Keep going |
| Train falls, valid flat | Starting to memorise | Stop near the flat point |
| Train falls, valid **rises** | Overfitting | Use the earlier checkpoint; add data; lower rank |
| Both flat and high | Not learning | Raise LR; check the data is actually being read |
| Spikes to NaN | LR too high, bad batch | Lower LR, check for empty/zero-length examples |
| Loss ~0.0 by step 100 | Memorisation of a tiny set | Stop; this model will only recite |

**The checkpoint to ship is not the last one.** It is the one with the lowest validation
loss. Every trainer writes checkpoints; use them.

### 1.3 Epochs, iterations, and why people get this wrong

```
steps_per_epoch = number_of_examples / batch_size
epochs          = (iterations × batch_size) / number_of_examples
```

300 examples, batch 2, 600 iterations → 4 epochs. That is a reasonable first run. A dataset
you see 20 times is a dataset you memorise.

### 1.4 Fitting the job into memory

In order of effectiveness:

1. **QLoRA** — 4-bit base instead of 16-bit. Biggest single win, ~4×.
2. **`batch-size 1`** + **`grad-accumulation-steps 4`** — same effective batch, less peak memory.
3. **`num-layers 8`** — fewer adapters, less backprop state.
4. **Lower `max_seq_length`** — activations scale with sequence length. 2048 → 1024 is often free.
5. **Gradient checkpointing** (`--grad-checkpoint`) — recompute instead of store, ~30 % slower.

Peak memory rule of thumb for QLoRA: `params_B × 0.6 GB`, plus `seq_len × batch × ~50 MB`.

### 1.5 Mac vs NVIDIA: pick one and don't fight it

| | Apple Silicon (MLX) | NVIDIA (Unsloth / PEFT) |
| --- | --- | --- |
| Install | `pip install "mlx-lm[train]"` | `pip install "unsloth[cu124]" trl` |
| Runs on | Unified memory, GPU via Metal | CUDA, needs the right driver/CUDA build |
| Speed | Good; bandwidth-bound | ~1.5–3× faster on comparable memory |
| Best for | Everything up to ~32B on a laptop | Fast iteration, larger models, rented GPUs |
| Gotcha | Close other apps; raise the GPU wired limit | CUDA/`bitsandbytes` version mismatch is 90 % of errors |

---

## 2. Lab — train it (4 h)

### 2.1 Mac: `mlx-lm` end to end

```bash
# 0. Layout
# data/train.jsonl  data/valid.jsonl   (Week 2)
mkdir -p adapters

# 1. Train (QLoRA because the model is 4-bit)
mlx_lm.lora \
  --model mlx-community/Qwen2.5-7B-Instruct-4bit \
  --train \
  --data ./data \
  --batch-size 1 \
  --grad-accumulation-steps 4 \
  --num-layers 16 \
  --iters 600 \
  --learning-rate 1e-4 \
  --max-seq-length 1024 \
  --adapter-path adapters \
  --steps-per-report 10 \
  --steps-per-eval 100 \
  --save-every 100
```

What each flag bought you:

| Flag | Why |
| --- | --- |
| `--batch-size 1 --grad-accumulation-steps 4` | Effective batch of 4 at the memory cost of 1 |
| `--num-layers 16` | Adapters on the top 16 layers — where behaviour lives |
| `--iters 600` | ~4 epochs over 300 examples at effective batch 4 |
| `--steps-per-eval 100` | Validation loss six times during the run — the whole point |
| `--save-every 100` | Lets you ship the *best* checkpoint, not the last |

### 2.2 Test the adapter without fusing

```bash
mlx_lm.generate \
  --model mlx-community/Qwen2.5-7B-Instruct-4bit \
  --adapter-path adapters \
  --prompt "Ticket: Export fails on Safari" \
  --max-tokens 80 --temp 0
```

Run the same five prompts you ran on the base model in Week 1. The difference should be
visible immediately: no preamble, exact JSON, correct labels.

### 2.3 NVIDIA: Unsloth, same idea

```python
from unsloth import FastLanguageModel
from trl import SFTTrainer, SFTConfig
from datasets import load_dataset

model, tokenizer = FastLanguageModel.from_pretrained(
    "unsloth/Qwen2.5-7B-Instruct-bnb-4bit",
    max_seq_length=1024, load_in_4bit=True,
)
model = FastLanguageModel.get_peft_model(
    model, r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16, lora_dropout=0.0, bias="none",
    use_gradient_checkpointing="unsloth",
)

ds = load_dataset("json", data_files="data/train.jsonl", split="train")

trainer = SFTTrainer(
    model=model, tokenizer=tokenizer, train_dataset=ds,
    args=SFTConfig(
        output_dir="adapters",
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        num_train_epochs=4,
        learning_rate=1e-4,
        max_seq_length=1024,
        logging_steps=10,
        eval_strategy="steps", eval_steps=100,
        save_strategy="steps", save_steps=100,
        report_to="none",
    ),
)
trainer.train()
model.save_pretrained("adapters")
tokenizer.save_pretrained("adapters")
```

### 2.4 Score it, immediately

```bash
# serve the adapter locally (any OpenAI-compatible runtime), then:
python eval/score.py my-first-adapter | tee eval/run-01.txt
```

Put it in `RESULTS.md`:

| run | base | iters | rank | train loss | valid loss | eval score |
| --- | --- | --- | --- | --- | --- | --- |
| baseline | Qwen2.5-7B-Instruct | — | — | — | — | 46 % |
| few-shot | Qwen2.5-7B-Instruct | — | — | — | — | 68 % |
| run-01 | Qwen2.5-7B-Instruct | 600 | 16 | 0.31 | 0.42 | **93 %** |

That table is the deliverable. Anyone can train; the table is proof.

### 2.5 Deliberately overfit it (45 min)

Train the same data for 3,000 iterations. Watch validation loss climb while train loss dives,
and score it. You will usually see the eval get *worse* than the 600-iteration run even though
the model can now recite your training set.

This is the most valuable 45 minutes of the course. You will never again trust "loss went
down" as evidence of anything.

### 2.6 A second run that changes one thing

Change **only** `--iters` (600 → 300) or **only** `--num-layers` (16 → 8), re-score, and record
it. One variable per run is the entire scientific method, and it is also how you find your
best config in an afternoon instead of a month.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Train at LR 1e-3 and watch it break | What divergence looks like |
| 2 | Train with `--num-layers 4` | Capacity vs quality, concretely |
| 3 | Resume from a checkpoint (`--resume-adapter-file`) | Runs are interruptible; laptops sleep |
| 4 | Compare loss curves at batch 1 vs batch 4 (same effective batch) | Noise vs memory |
| 5 | Train with the labels shuffled randomly | The floor: what "learning nothing" scores |
| 6 | Raise `max-seq-length` past your 95th percentile and note the memory | Truncation is silent data loss |

---

## 4. Deliverable — `ft-run-01` on GitHub

- [ ] `train.sh` (or `train.py`) with every hyperparameter explicit, no defaults hiding
- [ ] `adapters/` committed, or a release/repo link with the adapter + its base model name
- [ ] `logs/train.log` with the loss curve (copy the numbers; a pasted block is fine)
- [ ] `RESULTS.md` with baseline, few-shot, run-01, and the overfit run
- [ ] `NOTES.md` — what you changed between runs and what it did
- [ ] The eval score reproduced by a teammate from your committed script

**Interview question this earns you:** *"Your fine-tune got worse. What do you check?"* —
"Validation loss first: if it rose while train fell, I shipped an overfit checkpoint. Then the
data: label balance and leakage. Then the LR. In that order, because that is the order of
likelihood."

---

## 5. Self-check

1. Explain the difference between `iters` and `epochs`, with the formula.
2. Validation loss flattens at step 400 and rises at 700. Which checkpoint do you ship?
3. Why does lowering `batch-size` and adding gradient accumulation not change the maths?
4. Your loss is 0.02 after 100 steps. Is that good news? Why not?
5. Name three ways to fit a run that just went out of memory.
6. Why score the model after *every* run instead of at the end of the project?

---

## 6. Cheat sheet

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `RuntimeError: MPS backend out of memory` | Sequence length or batch too high | `--batch-size 1`, shorter `max-seq-length`, fewer layers |
| Loss NaN at step ~10 | LR too high, or a zero-length example | LR 1e-4, validate the dataset |
| Loss flat at ~2.5 forever | Data not being read, or LR too low | Print one batch; try 2e-4 |
| Great eval, terrible in chat | Trained on a format you do not use at inference | Match the system prompt to training exactly |
| Adapter does nothing at inference | Wrong base model, or adapter not loaded | Same base path, check the load log |
| CUDA error mentioning `bitsandbytes` | Version mismatch | Match the wheel to your CUDA version, or switch to MLX |
