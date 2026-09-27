---
title: "Projects & Capstone"
track: "ai"
week: 4
order: 5
type: "project"
hours: 12
summary: "Two portfolio projects and one capstone that combine RAG, tools, evals, and production engineering into interview-ready proof."
tags: ["projects", "portfolio", "capstone", "interview"]
---

# Projects & Capstone

Learning paths fail when they end at "read the docs". These three builds are what you put on
GitHub and in interviews. Do **all three** — one to prove breadth, one to prove depth, one to
prove you can finish.

---

## Project A — `llm-lab` (Week 1) — *the tool*

**What it is:** a CLI/library that makes a single model call reliable: typed structured
output, streaming, retries, token accounting, and an eval runner.

**Why it matters:** it is the piece every other project imports. Build it once, use it four
times.

**Scope:**

- [ ] `chat()`, `stream()`, `structured()` with pydantic validation + one repair retry
- [ ] Retry with exponential backoff, jitter, and a timeout
- [ ] `Usage` accounting exposed as context manager and JSON
- [ ] `run_eval(cases)` with per-tag accuracy
- [ ] 30+ golden cases for one real task (tickets, invoices, or commit messages)

**Stretch:** swap the provider behind an interface and prove the two backends produce
equivalent structured output for the same cases.

---

## Project B — `rag-docs` (Week 2) — *the product*

**What it is:** a Q&A service over a corpus **you actually care about** — your own repo
docs, a textbook, your notes, a public documentation set.

**Scope:**

- [ ] Ingestion with structure-aware chunking + metadata
- [ ] Hybrid retrieval (vector + BM25 + RRF) and a real reranker
- [ ] Answers with inline `[Sn]` citations and an enforced refusal path
- [ ] `recall@k` harness over ≥ 30 labelled questions
- [ ] Streamlit or a small React UI (40 lines is fine)
- [ ] README with the retrieval-evolution table

**Stretch:** add a "here is what I could not answer" page listing the questions that scored
0 on recall — it demonstrates engineering maturity better than any feature.

---

## Project C — `agent-desk` (Week 3–4) — *the flagship*

**What it is:** a multi-step assistant that does a real job end to end, with evals,
tracing, budgets, and a threat model.

**Pick a domain with real consequences** so the hard parts are real:
support triage · incident response assistant · code-review assistant · research assistant ·
data analyst over a real database.

**Scope:**

- [ ] 4–8 well-described tools with an allow-list and typed arguments
- [ ] Bounded loop: steps, cost, loop detection, always-answered tool calls
- [ ] Human approval on the irreversible action
- [ ] ≥ 50 tagged eval cases, CI-gated, per-tag reporting
- [ ] Tracing + cost dashboard
- [ ] One-page threat model
- [ ] Dockerfile, deployed, live URL in the README

**Stretch:** an MCP server exposing your top tools, so other clients can use them.

---

## Capstone — *"Ship it in 5 days"*

A single system that a non-technical person can use today, and that you can defend for
30 minutes in an interview.

**Day-by-day:**

| Day | Focus | Exit criterion |
| --- | --- | --- |
| 1 | Scope + baseline | One-sentence problem statement, 30-case eval set, baseline numbers |
| 2 | Retrieval / data layer | recall@5 ≥ 0.75, or the feature that replaces it |
| 3 | Model + tools | Happy path works end to end; streaming |
| 4 | Evals + observability | Suite in CI, traces visible, worst slice identified |
| 5 | Ship | Deployed, documented, announced to one real user |

**Definition of done (all must be true):**

- [ ] A non-engineer used it without you in the room
- [ ] `README.md` has: problem, architecture diagram, setup, and a **numbers table**
- [ ] Eval suite runs in CI and blocks merges
- [ ] Every LLM call is traced with tokens, cost, and latency
- [ ] There is a per-request cost cap and a refusal path
- [ ] A one-page threat model exists
- [ ] You can explain every design decision, including the ones you reverted

---

## Portfolio polish (1 h, do not skip)

Your GitHub is a hiring signal. For each project:

1. **One-line hook at the top of the README:** what it does, and the number that proves it.
   *"Citation-backed Q&A over 240 docs. recall@5 0.61 → 0.88, $0.31 per 1k queries."*
2. **Architecture in ASCII** — 10 lines beats a diagram you cannot update.
3. **The numbers table** — before/after, every project.
4. **"What I'd do next"** — a real roadmap item shows judgement.
5. **Screenshots / a 30-second GIF** of it actually working.
6. **Commit history tells the story.** 15–25 focused commits beat one giant "initial commit".

---

## The interview script you are building toward

Prepare these five; they are asked in nearly every AI-engineering loop:

1. *"Walk me through an AI system you shipped — what was the baseline quality, how did you
   measure it, what did you change, and what did it do to the numbers?"*
2. *"How do you decide between RAG, fine-tuning, and a bigger prompt?"*
3. *"Your answers are wrong. How do you debug it?"* → recall@k first, then trace, then prompt.
4. *"How do you handle prompt injection?"* → defence in depth; policy in code, not prompts.
5. *"How do you control cost and latency?"* → caching, routing, streaming, budget caps.

Rehearse until each answer cites a number from your own table.

---

## Optional: LLM-adjacent specialisations (week 5+)

Only after the path is done. Pick one:

- **Fine-tuning** (LoRA / PEFT) — when RAG is not enough: style, format, classification.
- **Inference & serving** — vLLM, quantisation, batching, self-hosting a small model.
- **Local / on-device models** — GGUF, llama.cpp, Ollama, quantised Mistral/Qwen.
- **Multimodal** — vision-language models, document/PDF understanding, screenshot agents.
- **ML fundamentals** — the actual maths: backprop, transformers, fine-tuning loops.
- **AI platform/infra** — queues, GPU scheduling, vector DB operations, IaC for models.

The four weeks get you hired as an **AI developer**. One of these makes you the person who
can also tune a model.
