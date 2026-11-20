---
title: "Train From Scratch — Start Here"
track: "scratch"
week: 0
order: 0
type: "overview"
hours: 2
summary: "Build a language model with your own hands: tokenizer, attention, training loop, and a model that writes coherent text — on one laptop, in weeks not years."
tags: ["overview", "from-scratch", "transformers", "training", "pytorch"]
---

# Train From Scratch — Start Here

**Who this is for.** You can write Python, you have run a model before, and you want to know
how the thing actually works — not by reading a paper, but by building one that produces text
you can read.

**What you get.** A transformer you wrote, trained on your own laptop, that generates coherent
English. Plus the intuition that makes every other ML conversation legible: why loss curves
look like that, why context length costs memory, why your 30M model cannot answer a question
about last Tuesday.

**Time commitment.** 3–4 weeks at ~12–15 focused hours per week. Training runs are hours, not
days, if you keep the model small — and you should keep the model small.

---

## The honest frame, before you start

> **You are not going to train a model that competes with a downloaded one. You are going to
> understand one.**

That is the whole value, and it is enormous. After this course, fine-tuning is obvious instead
of magical, and "just scale it up" stops being a mysterious incantation.

Here is what the numbers actually look like:

| Model size | Your laptop | A rented H100 |
| --- | --- | --- |
| 2M params, TinyShakespeare | 7 minutes | seconds |
| 20–70M params, TinyStories | **2–13 hours** | under an hour |
| 124M (GPT-2 small class) on 2.5B tokens | ~a week | ~6 hours |
| 1B on 20B tokens | months | ~2 weeks |
| 7B | no | ~$14,000 of GPU time |

So the target for this course is **10M–70M parameters**, trained on a small, clean dataset.
That size produces real, grammatical text — and it fits in a weekend.

---

## What "from scratch" means here

You will write, in order:

1. **A tokenizer** — text → integers, and back.
2. **A bigram model** — the smallest thing that learns anything at all.
3. **Self-attention** — the mechanism that made modern LLMs possible.
4. **A transformer** — attention + MLP + residuals, stacked.
5. **A training loop** — loss, gradients, optimizer, checkpoints, resumption.
6. **A sampler** — turning a probability distribution into words that feel deliberate.
7. **A fine-tuning pass** — teaching your model to follow instructions.

Every line is yours. Roughly 600 lines of PyTorch for a working GPT.

---

## The four-week map

### Week 1 — Tokens and a model that barely works
- Text → tokens → integers. Byte-pair encoding, and why "strawberry" has three `r`s.
- A bigram model: predict the next token from the last one. Cross-entropy, sampling, and the
  first loss number you will ever interpret.
- **Lab:** `names-bigram` — a character model that invents plausible names, trained in 90 seconds.

### Week 2 — Attention, and your first transformer
- Queries, keys, values. Why attention is just a soft, differentiable lookup table.
- Multi-head, causal masking, residuals, LayerNorm, the MLP block.
- **Lab:** a 10–30M parameter GPT trained on TinyStories that writes short, grammatical stories.

### Week 3 — The training loop is the craft
- AdamW, warmup, cosine decay, gradient clipping, accumulation, mixed precision.
- Checkpointing, resuming, throughput measurement, and debugging NaN.
- Scaling laws: why 20 tokens per parameter, and what a bigger model actually buys.
- **Lab:** a training run you can stop, resume, and explain by the numbers.

### Week 4 — From autocomplete to assistant
- Supervised fine-tuning on instruction/response pairs.
- Sampling strategies: temperature, top-k, top-p, and repetition penalties.
- Evaluation: perplexity is not task accuracy — measure both.
- **Lab:** your model follows 20 instructions, and you know exactly how badly.

### Capstone
One model, one dataset, one honest write-up. See `projects.md`.

---

## Prerequisites checklist

- [ ] Python: functions, classes, list comprehensions, virtualenvs.
- [ ] You can read a stack trace and find the line.
- [ ] You have run `pip install torch` on your machine at least once.
- [ ] You are comfortable with "a matrix is a grid of numbers" and "multiply rows by columns".

**You do NOT need:** calculus fluency, a maths degree, a GPU server, or prior PyTorch. You
will use derivatives as a concept ("the slope tells us which way to nudge"), not as an exercise.

---

## Environment setup (first hour)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install torch numpy tiktoken matplotlib
```

Verify the accelerator:

```python
import torch
print(torch.__version__)
print("MPS available:", torch.backends.mps.is_available())   # Apple Silicon
print("CUDA available:", torch.cuda.is_available())          # NVIDIA
```

On a Mac you want `MPS available: True`. On Windows/Linux with an NVIDIA card, `CUDA: True`.
If both are false you can still do Week 1 and Week 2 labs on CPU — slowly — which is a fine
way to learn, just not to train for hours.

### The dataset

```bash
mkdir -p data && cd data
curl -LO https://huggingface.co/datasets/roneneldan/TinyStories/resolve/main/TinyStories-train.txt
curl -Lo tinyshakespeare.txt https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt
```

TinyStories is ~2 GB of simple children's stories written with a 3–4 year old vocabulary. It
is the perfect first dataset: small vocabulary, short sentences, fast to learn, and you can
see progress in minutes instead of days.

---

## The mental model to carry through the whole course

> A language model is a function `f(tokens) → probability of the next token`, trained by
> nudging millions of numbers so that the true next token gets a higher probability.

Everything else — attention, layers, optimizers, LoRA later — is engineering in service of
that one sentence. When a run goes wrong, ask which part of that sentence broke:

| Question | Where to look |
| --- | --- |
| Are the tokens right? | Tokenizer, dataset encoding, off-by-one in the shift |
| Is the function expressive enough? | Model size, layers, heads, context length |
| Is the probability being computed correctly? | Loss, masking, numerical stability |
| Is the nudge working? | Learning rate, optimizer, gradient norms, warmup |
| Is it learning or memorising? | Validation loss, dataset size, epochs |

---

## Daily working rhythm

| Block | Time | What you do |
| --- | --- | --- |
| **Read** | 30–45 min | Concepts. Draw the tensor shapes on paper. |
| **Build** | 2–3 h | The lab, typed by you, not pasted. |
| **Run** | 30–60 min | Train something small and look at the loss. |
| **Break** | 20 min | Change one thing and predict the outcome *before* running. |
| **Ship** | 30 min | Commit the script, the loss log, and a sample of generated text. |

**Rule:** every model you train gets a saved checkpoint and a sample of its output in the
repo. "It trained" is not evidence. Text is evidence.

---

## What you will be able to say at the end

> *"I built a 24M-parameter GPT: byte-level BPE tokenizer, 6 layers, 6 heads, 384 dimensions.
> Pretrained on 300M tokens of TinyStories in about 3 hours on my M4, validation loss 1.71.
> Then SFT'd it on 4,000 instruction pairs and it answers simple questions — badly, but
> genuinely. Here is the code, the curve, and 20 samples."*

That paragraph is worth more in an interview than a certificate, because you can defend every
word of it.
