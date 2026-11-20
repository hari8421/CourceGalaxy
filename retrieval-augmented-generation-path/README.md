---
title: "RAG — Start Here"
track: "rag"
week: 0
order: 0
type: "overview"
hours: 2
summary: "Make a model answer from your own documents: embeddings, chunking, hybrid search, reranking, citations, and the eval harness that proves it works."
tags: ["overview", "rag", "retrieval", "embeddings", "citations"]
---

# RAG — Start Here

**Who this is for.** You can call a model and get an answer. You now want it to answer from
*your* documents — a folder of PDFs, your product docs, your support archive, a textbook —
without inventing things.

**What you get.** A working Q&A service that cites its sources, refuses when the answer is not
there, and comes with a measured recall@k number you produced yourself. All of it runs on one
laptop, with no GPU and no vector-database account.

**Time commitment.** 3–4 weeks at ~10–12 focused hours per week.

---

## The mental model

> **RAG is a search problem wearing a chat interface.**

You are not teaching the model anything. You are (1) finding the right paragraphs, (2) putting
them in the prompt, and (3) instructing the model to answer only from them. Every quality
problem is one of those three, and the order of debugging is exactly that order.

```
                 ┌──────────── offline, once ────────────┐
  documents ──► parse ──► chunk ──► embed ──► vector store
                                                   │
                 ┌──────────── online, per question ──┘
  question ──► embed ──► search (vector + keyword) ──► rerank ──► prompt ──► answer + citations
```

Two consequences people learn the hard way:

- **Better retrieval beats better prompting, every time.** If the right paragraph is not in
  the top 5, no prompt can rescue the answer.
- **Generation failures are usually retrieval failures in disguise.** Measure retrieval first
  or you will spend a week rewriting a system prompt that was never the problem.

---

## RAG vs fine-tuning, in one table

| Question | RAG | Fine-tuning |
| --- | --- | --- |
| Where do facts come from? | The retrieved text | The weights (frozen at training time) |
| Can it know today's prices? | Yes | No |
| Can it cite a source? | Yes, natively | No |
| Does it work with 10 documents or 10 million? | Both | Neither — it does not store documents |
| Can it change tone/format? | Weakly | Strongly |
| Cost to update | Re-index | Retrain |

The rule: **RAG for facts, fine-tuning for behaviour.** Most real systems need both — a
fine-tuned model that emits your JSON, fed by retrieval for the facts. This course is the RAG
half.

---

## The 4-week map

### Week 1 — Embeddings and vector search
- What an embedding is, why cosine similarity works, and how to do semantic search in 30 lines
  with nothing but NumPy.
- **Lab:** `hello-vector` — search 100 documents by meaning, then compare three embedding models.

### Week 2 — Ingestion and chunking
- Parsing PDFs, HTML and Markdown. Chunk sizes, overlap, structure-aware splitting, metadata,
  idempotent re-indexing, and what to do with tables and code.
- **Lab:** `rag-docs` — a real corpus ingested with headings preserved and hashes for ids.

### Week 3 — Hybrid search and reranking
- Why pure vectors miss error codes and product names. BM25, reciprocal rank fusion, cross-
  encoder rerankers, query rewriting, metadata filters.
- **Lab:** measure recall@5 for vector-only, keyword-only, hybrid, and hybrid + rerank.

### Week 4 — Answering, evaluation, and production
- Grounded prompts, inline citations, refusal thresholds, faithfulness checks, latency and cost,
  caching, and a small UI.
- **Lab:** ship it with an eval report and a "questions we could not answer" page.

### Capstone
One corpus, one service, one numbers table. See `projects.md`.

---

## Prerequisites checklist

- [ ] Python: functions, dicts, list comprehensions, a virtualenv.
- [ ] You can call an LLM API (or a local model) and read the response.
- [ ] You can use a terminal and git.
- [ ] You have 50–500 documents you actually care about.

**You do NOT need:** a vector database, a GPU, LangChain, an embeddings API key (local models
work), or any ML theory.

---

## Environment setup (first hour)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install openai chromadb sentence-transformers pypdf rank-bm25 python-dotenv
```

```bash
# .env
OPENAI_API_KEY=sk-...            # optional; only for generation or hosted embeddings
```

**Fully local alternative** — no API key at all:

```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("BAAI/bge-small-en-v1.5")   # ~130 MB, runs on CPU
vectors = model.encode(["your first document", "your second"])
```

Generation can come from a local model too (LM Studio on `localhost:1234`, or Ollama on
`localhost:11434`). Both speak the OpenAI-compatible API, so every code sample in this course
works unchanged.

> **Cost note.** Embedding a corpus is the cheap part: 500 documents of 2 pages is roughly
> 100k tokens, a few cents. The expensive part is *querying* — every question re-embeds and
> sends context. That is where the caching lesson in Week 4 pays for itself.

---

## The corpus you should use

Pick something where you can tell a right answer from a wrong one:

- your own project's documentation folder
- a public docs site you know well (FastAPI, Kubernetes, Postgres)
- a textbook chapter set
- 200 support tickets plus their resolutions

Do **not** start with a 40,000-page web scrape. Corpus quality determines everything, and you
need to be able to eyeball the chunks.

---

## Daily working rhythm

| Block | Time | What you do |
| --- | --- | --- |
| **Read** | 30 min | Concepts — one section, no code. |
| **Build** | 2 h | The lab. Run it on your corpus, not the example one. |
| **Measure** | 45 min | Recall@k, latency, token counts. Write the numbers down. |
| **Break it** | 20 min | Delete chunk headers, remove a filter, ask an unanswerable question. |
| **Ship** | 30 min | Commit with the eval table updated. |

---

## What you will be able to say at the end

> *"Citation-backed Q&A over 240 pages of our docs. recall@5 went from 0.61 to 0.88 after I
> added heading paths to chunks and switched to hybrid retrieval; answers cite `[S1]` and
> refuse when retrieval scores below threshold. p95 latency 1.4 s, $0.31 per 1,000 questions."*

Every number in that sentence is one you measured. That is the whole course.
