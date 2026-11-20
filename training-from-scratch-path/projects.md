---
title: "Projects & Capstone"
track: "scratch"
week: 4
order: 5
type: "project"
hours: 12
summary: "Three from-scratch builds that each prove a different thing, and a capstone that ends with your own model generating text you can show someone."
tags: ["projects", "portfolio", "capstone", "nanoGPT", "tokenizer"]
---

# Projects & Capstone

Three builds. Each is small enough to finish and deep enough to teach something you cannot read
your way to.

---

## Project A — `bpe-from-scratch` (Week 1) — *the tokenizer*

**What it is:** a byte-pair encoder you wrote, trained on a corpus of your choice, with a
vocabulary of 2,000 tokens.

**Why it matters:** tokenization is the layer everyone treats as magic. Once you have written
the merge loop, "why is the model bad at counting letters" and "why is my prompt 4,000 tokens"
both become obvious.

**Scope:**

- [ ] Byte-level base vocabulary (256 tokens) + 1,744 learned merges
- [ ] `train(text, vocab_size)` that records merges in the order learned
- [ ] `encode` / `decode` with a round-trip property test (`decode(encode(s)) == s` for 1,000
      random strings including emoji and CJK)
- [ ] Compression report: characters per token on held-out text vs raw bytes
- [ ] Compare against `tiktoken` on the same corpus: tokens per sentence, and where they differ

**Stretch:** add special tokens (`<|endoftext|>`, `<|user|>`) and prove they are never merged.

---

## Project B — `gpt-tiny` (Week 2–3) — *the model*

**What it is:** your transformer, trained on TinyStories or a domain corpus you care about
(recipe steps, commit messages, product descriptions, chess games in PGN).

**Why it matters:** it is the artefact. Everything else in this course supports it.

**Scope:**

- [ ] 10–30M parameters, config in one place, every dimension explained
- [ ] Tokenize-once pipeline with `memmap` loading
- [ ] Warmup + cosine schedule, clipping, accumulation, validation every N steps
- [ ] Resumable checkpoints that include the config
- [ ] `bench.md`: tokens/sec, total tokens seen, hours, final train and val loss
- [ ] 20 samples at three temperatures, in the repo

**Stretch:** train the same config on a *different* corpus and write a page comparing what each
model learned. Style transfer, at the level of the whole model, is a genuinely interesting
result to discuss.

---

## Project C — `instruct-tiny` (Week 4) — *the assistant*

**What it is:** your model, SFT'd on 2,000–5,000 instruction pairs for one narrow task.

**Why it matters:** it closes the loop — pretrain, fine-tune, evaluate, serve — at a scale you
can hold in your head.

**Scope:**

- [ ] Prompt-masked SFT with a single canonical template
- [ ] Eval: task accuracy, perplexity, and a written failure taxonomy
- [ ] A side-by-side comparison against a downloaded instruct model on the same 30 cases
- [ ] GGUF export and a run command that a stranger can execute
- [ ] `MODEL_CARD.md` with limitations stated first

**Stretch:** add a 5 % replay of pretraining text into the SFT mix and measure the forgetting it
prevents. That experiment is a real contribution to your own understanding.

---

## Capstone — *"Publish a model you built"*

Publish one model, end to end, with the entire pipeline in the repository.

**Day by day:**

| Day | Focus | Exit criterion |
| --- | --- | --- |
| 1 | Corpus + tokenizer | Round-trip test passes; compression measured |
| 2 | Tiny model + pipeline | 200 steps, loss falls, a sample is generated |
| 3 | Real pretraining run | Tokens/sec measured; run time predicted and met |
| 4 | SFT + evaluation | Task score, perplexity, failure list |
| 5 | Publish | Model card, GGUF, README with a sample anyone can read |

**Definition of done:**

- [ ] A stranger can reproduce your final validation loss from the repo and the dataset link
- [ ] Every hyperparameter has a one-line justification in `NOTES.md`
- [ ] You can explain the causal mask, the `√d` divisor, and warmup without notes
- [ ] The model card admits what it cannot do, with examples
- [ ] There is a sample of generated text in the README — not a promise, a sample
- [ ] You compared against a downloaded model and reported the gap honestly

---

## Portfolio polish

1. **Hook with the numbers:** *"A 24M-parameter GPT I wrote and trained on a laptop: val loss
   1.71, 8.2k tokens/sec, 4 hours. It writes TinyStories-style prose and answers 62 % of a
   30-case instruction set."*
2. **The architecture in ASCII** — 10 lines, every shape labelled.
3. **The loss curve** with the chosen checkpoint marked and the overfit run shown alongside.
4. **Samples, before and after** — step 0 vs final is the most convincing single image you can
   produce.
5. **The comparison table** against a real model, with the honest ratio.

---

## The interview script you are building toward

1. *"Walk me through a transformer."* → tokens, embeddings, attention, MLP, residuals, logits,
   loss. You have written all of it.
2. *"Why is attention quadratic?"* → every position scores against every other: `T×T` per head.
   That is why context length costs memory and why long-context work is hard.
3. *"What did you learn from training a model from scratch?"* → the pipeline is the hard part;
   loss curves lie; data quality beats scale at the small end; and you now know why fine-tuning
   is usually the right engineering choice.
4. *"How would you scale this up 100×?"* → more tokens before more parameters, gradient
   accumulation for effective batch size, FSDP/sharding for memory, and a serious data pipeline.
5. *"Why not just do this for production?"* → cost: a from-scratch 7B is ~$14k of GPU time and
   still loses to a downloaded model. The right use of this knowledge is choosing, evaluating,
   and fine-tuning existing models well.
