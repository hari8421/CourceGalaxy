---
title: "AI Developer — Start Here"
track: "ai"
week: 0
order: 0
type: "overview"
hours: 2
summary: "The 3-4 week plan that turns a working software developer into an AI developer shipping real products."
tags: ["overview", "career", "roadmap"]
---

# AI Developer — Start Here

**Who this is for.** You already ship software. You know a language, a database, an HTTP
request, a code review, a deploy. You do **not** need to relearn programming. You need to
learn one genuinely new domain — the LLM domain — and re-point your existing engineering
instincts at it.

**The target role.** An AI developer is a backend developer who can treat a language model as
a **non-deterministic, latency-bound, token-metered dependency** with a failure mode nobody
wrote a spec for. That is the whole job description. Everything in this path exists to make
that sentence true in your hands.

**Time commitment.** 3–4 weeks at **~15–20 focused hours per week**. If you only have 8 hours
a week, double the calendar. Do not compress the labs — the labs are the course.

---

## The one mental model that makes the rest obvious

> A language model is a **statistical function from a token sequence to a probability
> distribution over the next token**, wrapped in an API that charges you per token and takes
> 500–3000 ms to answer.

Every engineering decision follows from those five words:

| Model property | Engineering consequence |
| --- | --- |
| **Statistical** (not deterministic) | You must *test behaviour*, not just test functions. Same input ≠ same output. Everything needs evals. |
| **Token-based** | Cost and latency are proportional to token count. Context is a **budget you allocate**, not a dump you fill. |
| **Context window** | The model only knows what is in the window *right now*. Memory is your job, not the vendor's. |
| **Non-deterministic** | Never let the model do arithmetic, lookups, or side effects without a deterministic tool in the loop. |
| **Slow** | 2 s of silence is a UX problem. Stream, cache, parallelise, or make it feel instant. |

---

## What actually separates a "prompt guy" from an AI developer

| A prompt guy | An AI developer |
| --- | --- |
| Crafts one clever prompt | Owns a system: retrieval, tools, evals, fallbacks, cost control |
| Adds `try/catch` around the call | Adds a retry, backoff, timeout, circuit breaker, and a fallback answer |
| Ships to prod on Friday | Ships a graded eval set *before* the feature |
| Passes the whole context window | Curates 8 relevant chunks out of 8,000 |
| Optimises for "it sounded smart" | Optimises for "task success rate on my eval set went 0.62 → 0.81" |
| Can explain the architecture | Can rebuild it from an empty repo in an afternoon |

This path is built to move you from left column to right column.

---

## The 4-week map

### Week 1 — LLM fundamentals you can build on
- How models actually work: tokens, embeddings, transformers, sampling.
- **Practical:** the first LLM app with **structured output**, streaming, token accounting, and a cost logger.
- **Milestone project:** `llm-lab` — a CLI that calls a model, streams to the terminal, and prints a live token/cost meter.

### Week 2 — Retrieval, or "how do I make it know my data?"
- Embeddings, chunking strategies, vector databases, hybrid search, rerankers.
- **Practical:** ingest a real corpus (your own repo, docs, or notes) and build a citation-backed Q&A with measurable retrieval quality.
- **Milestone project:** `rag-docs` — RAG over a folder of PDFs/Markdown with inline source citations and a recall@k eval harness.

### Week 3 — Agents and tools
- Function calling, tool design, planning loops, memory, MCP, when *not* to use an agent.
- **Practical:** build a tool-using agent that does something multi-step and real, with schema-validated tool inputs.
- **Milestone project:** `agent-desk` — a support-triage agent that reads tickets, calls your tools, and drafts a reply, with a bounded step budget.

### Week 4 — Production & evaluation
- Evals (offline + online), observability, cost/latency optimisation, caching, security, prompt injection, deployment.
- **Practical:** instrument, grade, and *improve* a real system with numbers.
- **Milestone project:** take your Week 2–3 system to production: traces, an eval suite in CI, a cost budget alarm, and a README that explains the trade-offs.

### Capstone
One portfolio-grade system that combines everything. See `projects.md`.

---

## Prerequisites checklist (you probably already pass)

- [ ] Comfortable with HTTP: methods, status codes, JSON, auth headers.
- [ ] Comfortable with one backend language (Python, JS/TS, Java…).
- [ ] Have used a database and written a `WHERE` clause that filters text.
- [ ] Can use git and a terminal without panic.
- [ ] Have deployed something, even a free-tier VM.

**What you do NOT need:** a maths degree, PyTorch, a GPU, a research paper, or ML experience.

---

## Environment setup (do this in the first hour of Week 1)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install openai tiktoken pydantic python-dotenv rich
```

```bash
# .env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini          # cheap while you learn
EMBEDDING_MODEL=text-embedding-3-small
```

**Rule for these four weeks:** while learning, use the cheapest capable model.
You are tuning *systems*, not buying quality with money. Re-run your best prompt against a
larger model at the end of each week and note the delta.

> 🇪🇺 **Not on OpenAI?** Every example works with Anthropic Claude, Google Gemini, or any
> OpenAI-compatible local model (Ollama, vLLM, OpenRouter). The *concepts* are identical;
> only the SDK call shape changes.

---

## Daily working rhythm (this is what makes 3–4 weeks possible)

| Block | Time | What you do |
| --- | --- | --- |
| **Read** | 30–45 min | The "Concepts" section of one module. Notes only — no code. |
| **Build** | 2–3 h | The lab. Code first, docs second. You learn by breaking it. |
| **Break** | 20 min | Deliberately: delete a chunk, break the schema, send garbage, print token counts. |
| **Ship** | 30–60 min | Commit, write a 3-line README, push. Unshipped labs don't count. |
| **Review** | 20 min | Answer the module's self-check questions out loud. |

**Rule:** no day ends without a commit. Four weeks ≈ 20 working days ≈ 20 commits.

---

## How to use this platform

- The left rail is your curriculum. Progress is stored in your browser.
- Every module ends with a **Lab**, a **Deliverable**, and a **Self-check**.
- Markdown files live in this folder (`ai-developer-path/`) — they are the source of truth.
  Edit them directly and the site updates; that is also your offline copy.

---

## The metric you are optimising for

At the end of the four weeks you should be able to answer this in a 30-minute interview:

> *"Walk me through an AI system you shipped. What was the baseline quality, how did you
> measure it, what did you change, and what did it do to the numbers?"*

If you can answer that with real numbers from your own repos, the path worked.
