---
title: "Fine-Tuning — Start Here"
track: "finetune"
week: 0
order: 0
type: "overview"
hours: 2
summary: "Turn a downloaded open model into your own model: datasets, LoRA, a first training run, honest evaluation, and shipping it back into LM Studio."
tags: ["overview", "fine-tuning", "lora", "qlora", "local-llm"]
---

# Fine-Tuning — Start Here

**Who this is for.** You can run a model (LM Studio, Ollama, or a provider API), you can
write a Python script, and you want a model that does *your* thing — your format, your tone,
your labels. No maths degree, no GPU cluster, no research paper.

**What you get.** A model you trained yourself, on your own data, that you can prove is
better than the base model at your task — with numbers, not vibes. The whole path runs on a
laptop. A Mac with 32–48 GB of unified memory or a PC with an 8–12 GB NVIDIA card is plenty
for everything here.

**Time commitment.** 3–4 weeks at ~10–15 focused hours per week. The training runs
themselves take minutes; the thinking and the data work take the hours.

---

## The one mental model that makes the rest obvious

> **Fine-tuning does not add knowledge. It changes behaviour.**

A base model already knows English, code, and reasoning. Fine-tuning nudges *how it responds*:
the shape of its output, its tone, which label it picks, when it calls a tool. Ask it for a
fact it never saw and it will still hallucinate — that is what retrieval is for.

| You want… | Use |
| --- | --- |
| The model to know *your* documents, fresh facts, today's prices | **RAG** (see the RAG course) |
| The model to always answer in your JSON schema | **Fine-tune** |
| A specific tone, persona, or house style | **Fine-tune** |
| A classifier over your own labels | **Fine-tune** |
| Reliable tool calls for your 12 functions | **Fine-tune** |
| Better general intelligence | **Neither** — pick a bigger base model |

The sentence to memorise: **RAG for facts, fine-tuning for behaviour, prompting first.**

---

## Why LoRA, in one page

Full fine-tuning updates every weight in the model. For a 7B model that means ~120 GB of
memory for the optimizer state alone. You do not have that, and you do not need it.

**LoRA** freezes the original weights and trains two small matrices per layer whose product
is added to the original. You end up training ~0.1–1 % of the parameters:

```
output = W·x  +  (B·A)·x        W frozen, A and B tiny (rank r, e.g. 8 or 16)
```

**QLoRA** goes one step further: keep the frozen base in 4-bit, train the adapter in 16-bit.
That is what makes a 7B model trainable in ~12 GB. The quality cost is small; the memory
saving is enormous.

Rough memory for QLoRA training: **≈ 0.6 GB per billion parameters**, plus activations that
grow with sequence length and batch size.

| Base model | QLoRA peak | Fits on |
| --- | --- | --- |
| 1–3B | 2–4 GB | Anything |
| 7–8B | 12–16 GB | 16 GB Mac, 8 GB GPU |
| 14B | 20–24 GB | 32 GB Mac, 24 GB GPU |
| 32B | 28–36 GB | 48 GB Mac |

---

## The 4-week map

### Week 1 — What fine-tuning actually is
- The behaviour-not-knowledge model, LoRA vs QLoRA vs full, and the file formats that trip
  everyone up (safetensors vs GGUF vs MLX).
- **Lab:** pick a base model, run it, and build the **50-case eval set** you will judge every
  later run against. No eval, no fine-tuning.

### Week 2 — Data, which is 80 % of the job
- Chat templates, the JSONL shape trainers expect, how many examples, how to write them,
  dedup, leakage, and the licensing you inherit.
- **Lab:** a validated 300–800 example dataset with train/valid splits and a stats script.

### Week 3 — Your first training run
- `mlx-lm` (Mac) or Unsloth (NVIDIA/Colab), the five hyperparameters that matter, and how to
  read a loss curve instead of guessing.
- **Lab:** a completed 7–8B QLoRA run, with the loss curve and a fixed overfit.

### Week 4 — Evaluation and shipping
- Before/after scoring, regression hunting, fusing the adapter, GGUF conversion, quantization,
  and importing into LM Studio or Ollama.
- **Lab:** a versioned model in LM Studio plus a model card with real numbers.

### Capstone
One model, one dataset, one honest numbers table. See `projects.md`.

---

## Prerequisites checklist

- [ ] You can run a model locally and talk to it (LM Studio, Ollama, or `llama.cpp`).
- [ ] You can write and run a Python script; `pip install` does not scare you.
- [ ] You can use a terminal and git.
- [ ] You have a folder of *something* — support replies, tickets, notes, code reviews —
      that could become training data.

**You do NOT need:** PyTorch experience, a GPU server, linear algebra beyond "a matrix is a
grid of numbers", or permission from anyone.

---

## Environment setup (do this in the first hour)

### On a Mac (Apple Silicon) — recommended

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install "mlx-lm[train]" datasets huggingface_hub
```

`mlx-lm` uses Apple's MLX framework, so training runs on the GPU with unified memory. No CUDA,
no drivers, no `bitsandbytes`.

### On Windows/Linux with an NVIDIA card

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install "unsloth[cu124]" trl datasets
```

### Either way: an inference runtime

Install [LM Studio](https://lmstudio.ai) or [Ollama](https://ollama.com). You will use it in
Week 1 to meet the base model and in Week 4 to run your own.

```bash
# LM Studio ships a CLI
lms --help
```

> **One warning that saves a week of confusion.** LM Studio downloads **GGUF** (or MLX on
> Apple Silicon) files. You cannot fine-tune a GGUF. When you pick a base model, go to the
> original repository — `Qwen/Qwen2.5-7B-Instruct`, **not** `...-GGUF` — and train that.

---

## Daily working rhythm

| Block | Time | What you do |
| --- | --- | --- |
| **Read** | 30 min | The Concepts section of one module. No code yet. |
| **Build** | 2–3 h | The lab. Type it, run it, break it. |
| **Inspect** | 30 min | Look at the numbers: loss, eval scores, token lengths, memory. |
| **Ship** | 30 min | Commit the script, the dataset, the numbers table. |
| **Review** | 20 min | Answer the self-check out loud. |

**Rule:** every training run gets committed with its config and its eval score. A run you
cannot reproduce is a rumour, not a result.

---

## What "good" looks like at the end

You should be able to say, and defend:

> *"I fine-tuned Qwen2.5-7B on 620 of my own support replies. Base model scored 41 % exact
> format match on my 50-case eval; my adapter scored 93 %. It cost 22 minutes on my laptop.
> Here is the loss curve, the eval script, and the GGUF you can run yourself."*

That sentence, with the numbers attached, is the whole course.
