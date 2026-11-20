---
title: "Week 3 — The Training Loop Is the Craft"
track: "scratch"
week: 3
order: 3
type: "module"
hours: 15
summary: "AdamW, warmup and cosine decay, gradient clipping and accumulation, checkpoint and resume, throughput measurement, and how to debug a loss that will not move."
tags: ["training-loop", "adamw", "learning-rate", "checkpointing", "throughput", "debugging"]
---

# Week 3 — The Training Loop Is the Craft

**Goal by Friday:** a training run that survives interruption, reports tokens/second, and whose
loss curve you can diagnose at a glance. Plus one deliberately broken run that you fix from the
symptoms alone.

---

## 1. Concepts (2 h)

### 1.1 A proper optimizer setup

```python
# Weight decay on matrices, none on biases and LayerNorm — the standard split.
decay, no_decay = [], []
for name, p in model.named_parameters():
    if not p.requires_grad:
        continue
    (decay if p.dim() >= 2 else no_decay).append(p)

opt = torch.optim.AdamW(
    [{"params": decay, "weight_decay": 0.1},
     {"params": no_decay, "weight_decay": 0.0}],
    lr=6e-4, betas=(0.9, 0.95), eps=1e-8,
)
```

Why these values:
- **`betas=(0.9, 0.95)`** — the second beta lower than the default `0.999` because language-model
  gradients are noisy; a shorter memory adapts faster.
- **`weight_decay=0.1`** on matrices only — decays unused weights, keeps biases free.
- **`lr=6e-4`** for small models at batch ~0.5M tokens; `3e-4` is the safe default if unsure.

### 1.2 Learning-rate schedule: warmup, then decay

```
lr
 6e-4 |      *  *  *
      |    *        *  *
 6e-5 |  *              *  *  *  *  *
      +--------------------------------
        0   100          2000     3000 steps
        warmup            cosine decay to 10%
```

- **Warmup (50–200 steps):** Adam's second-moment estimate is garbage on step 0. A big first
  step can wreck the weights permanently. Ramp up.
- **Cosine decay to ~10 % of peak:** big steps early to find the region, small steps late to
  settle into it. This alone is often worth a few points of final loss.

```python
import math

def lr_at(step, peak=6e-4, warmup=100, total=3000, floor_ratio=0.1):
    if step < warmup:
        return peak * (step + 1) / warmup
    progress = (step - warmup) / max(1, total - warmup)
    cos = 0.5 * (1 + math.cos(math.pi * progress))
    return peak * (floor_ratio + (1 - floor_ratio) * cos)
```

### 1.3 Gradient clipping and accumulation

**Clipping** caps the global gradient norm. One bad batch should not undo an hour of training:

```python
torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
```

If clipping fires constantly, your LR is too high or your data has a pathological batch.

**Accumulation** gives you a large effective batch on small memory:

```python
for micro in range(grad_accum_steps):
    x, y = get_batch("train", micro_batch, block_size, device)
    loss = model(x, y)[1] / grad_accum_steps     # divide so gradients average
    loss.backward()
clip; opt.step(); opt.zero_grad(set_to_none=True)
```

Forgetting the `/ grad_accum_steps` makes your effective LR `N×` larger. That is the classic
"why did my loss explode when I added accumulation" bug.

### 1.4 Precision: what your machine actually supports

| Device | Recommended | Notes |
| --- | --- | --- |
| Apple Silicon (MPS) | `float32` first, then `float16` | bf16 support is patchy; fp16 needs care with loss scaling |
| NVIDIA (CUDA) | `bfloat16` autocast | Stable, no loss scaling needed |
| CPU | `float32` | Slow but correct |

```python
use_amp = device == "cuda"
with torch.autocast(device_type="cuda", dtype=torch.bfloat16, enabled=use_amp):
    logits, loss = model(x, y)
```

For a 10–30M model, fp32 is fast enough. Do not lose a day to mixed-precision numerics for a
15 % speedup.

### 1.5 Checkpointing and resuming (non-negotiable)

Laptops sleep. Runs get interrupted. A run you cannot resume is a run you will repeat.

```python
def save(path, model, opt, step, best_val):
    torch.save({
        "model": model.state_dict(),
        "opt": opt.state_dict(),
        "step": step,
        "best_val": best_val,
        "config": {"n_layer": 6, "n_head": 6, "n_embd": 384, "block_size": 256},
    }, path)

def load(path, model, opt):
    ckpt = torch.load(path, map_location="cpu")
    model.load_state_dict(ckpt["model"])
    opt.load_state_dict(ckpt["opt"])
    return ckpt["step"], ckpt["best_val"]
```

Save the config *inside* the checkpoint. Six weeks later, "which model is this file?" is a real
question.

### 1.6 Measure throughput, don't guess

```python
import time
t0 = time.time()
# ... one step ...
dt = time.time() - t0
tokens_per_sec = batch_size * block_size / dt
print(f"{tokens_per_sec:,.0f} tok/s | {dt*1000:.0f} ms/step")
```

Then compute the honest number before you commit to a run:

```
hours = total_tokens / (tokens_per_sec * 3600)
```

A 25M model on 500M tokens at 8,000 tok/s is **17 hours**. Know that before you start, not
after.

### 1.7 Scaling laws, in two rules of thumb

1. **Chinchilla:** for a fixed compute budget, ~**20 tokens per parameter** is roughly optimal.
   A 25M model wants ~500M tokens. A 1B model wants ~20B.
2. **Loss falls as a power law** in both parameters and tokens. Doubling either buys a small,
   predictable improvement — which is why "just make it bigger" is expensive and why data
   quality beats scale at the small end.

For this course: more *clean* tokens beats more parameters. TinyStories is deliberately simple;
a 25M model on it produces better text than a 100M model on noisy web scrapes.

---

## 2. Lab — a run you can trust (5 h)

### 2.1 The complete loop

```python
import math, time, torch
from model import GPT
from data import get_batch

device = "mps" if torch.backends.mps.is_available() else "cpu"
model = GPT(vocab_size=50257, n_layer=6, n_head=6, n_embd=384, block_size=256).to(device)
# ... optimizer split from 1.1 ...

total_steps, batch, block, accum = 4000, 8, 256, 4
best_val = float("inf")

for step in range(total_steps):
    lr = lr_at(step, peak=6e-4, warmup=100, total=total_steps)
    for g in opt.param_groups:
        g["lr"] = lr

    t0 = time.time()
    opt.zero_grad(set_to_none=True)
    for _ in range(accum):
        x, y = get_batch("train", batch, block, device)
        _, loss = model(x, y)
        (loss / accum).backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step()
    dt = time.time() - t0

    if step % 50 == 0:
        model.eval()
        with torch.no_grad():
            xv, yv = get_batch("val", batch, block, device)
            _, vloss = model(xv, yv)
        model.train()
        print(f"{step:5d} lr {lr:.2e} train {loss.item():.3f} val {vloss.item():.3f} "
              f"{batch*block*accum/dt:,.0f} tok/s")

    if step % 500 == 0 or step == total_steps - 1:
        if vloss.item() < best_val:
            best_val = vloss.item()
            save("ckpt_best.pt", model, opt, step, best_val)
        save("ckpt_last.pt", model, opt, step, best_val)
```

Two habits worth more than any hyperparameter: **evaluate on validation regularly**, and
**keep the best checkpoint, not the last one**.

### 2.2 Run the three configs

Train the same tiny preset three ways and record the table:

| config | warmup | schedule | final val loss |
| --- | --- | --- | --- |
| A | none | constant 6e-4 | ? |
| B | 100 | constant 6e-4 | ? |
| C | 100 | cosine to 10 % | ? |

C usually wins. This is your first empirical result that is *yours*, and it will stick better
than any blog post.

### 2.3 Break it on purpose, then fix it from symptoms only

Do these one at a time, in this order, and write down what you saw **before** looking at the fix:

| Break | Symptom you should recognise |
| --- | --- |
| `y = x` instead of `y = x+1` | Loss drops fast, samples are echoes of the prompt |
| Remove `clip_grad_norm_` and set LR 6e-3 | Loss spikes then NaN |
| Remove the mask | Train loss ~0, generation is noise |
| Forget `/accum` | Effective LR 4× too high, unstable |
| Freeze the embeddings (`requires_grad=False`) | Loss plateaus high, never improves |
| `model.train()` left on during eval | Validation loss noisy and worse than train |

### 2.4 Resume from a checkpoint (15 min)

Kill the run at step ~800 with Ctrl-C, then restart with `load("ckpt_last.pt", ...)` and
continue from the saved step. If the loss curve picks up where it left off, your loop is
production-grade for this course.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Time 20 steps at `block_size` 128 vs 256 vs 512 | Memory and time both scale with context |
| 2 | Train with `batch 64` vs `batch 8 + accum 8` | Same maths, different hardware behaviour |
| 3 | Log gradient norm every 50 steps | What clipping is actually doing |
| 4 | Train two models with seeds 0 and 1 | Run-to-run variance is real; don't chase noise |
| 5 | Compute your tokens/sec, then predict hours for 1B tokens | Planning a run before starting it |
| 6 | Load `ckpt_best.pt` instead of `ckpt_last.pt` and sample both | Why "last" is not "best" |

---

## 4. Deliverable — `gpt-train` on GitHub

- [ ] `train.py` with warmup, cosine decay, clipping, accumulation, and periodic validation
- [ ] `ckpt_best.pt` + `ckpt_last.pt` and a `load.py` that resumes
- [ ] `bench.md` — tokens/sec for three configs, plus predicted hours for 1B tokens
- [ ] `schedule.md` — the three-config comparison table with final losses
- [ ] `debug.md` — the six broken runs, their symptoms, and their fixes
- [ ] `samples/best.txt` — 10 samples from the best checkpoint

**Interview question this earns you:** *"Your loss plateaus. What do you check, in order?"* —
"Data pipeline (is it actually reading new batches), LR schedule, gradient norm, then model
capacity. In that order, because the first two cause most silent failures."

---

## 5. Self-check

1. Why does Adam need warmup when SGD mostly does not?
2. What does cosine decay buy you over a constant learning rate?
3. Why is clipping a safety net rather than a tuning knob?
4. You double `grad_accum_steps` and forget to divide the loss. What happens to the effective LR?
5. Why does memory scale with `block_size` even though the parameter count does not?
6. Given tokens/sec and your token budget, how long is your run? Show the arithmetic.

---

## 6. Cheat sheet

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Loss spikes then NaN | LR too high, no warmup | Peak 6e-4, warmup 100, clip 1.0 |
| Loss perfectly flat | LR 0, frozen params, or a stale batch | Print LR and one batch twice |
| Validation far worse than train | Overfitting or dropout left on in eval | `model.eval()`, more data |
| Run is 4× slower than expected | Context too long, no accumulation | Measure tok/s; reduce block size |
| Resumed run restarts at a worse loss | Optimizer state not saved | Save `opt.state_dict()` |
| Identical samples every time | Temperature 0 / greedy decoding | Add temperature and `top_k` |
