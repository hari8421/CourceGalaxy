---
title: "Week 3 — Hybrid Search and Reranking"
track: "rag"
week: 3
order: 3
type: "module"
hours: 13
summary: "Add BM25 for exact terms, fuse rankings with RRF, rerank with a cross-encoder, rewrite queries, and filter by metadata — then prove each step's contribution with recall numbers."
tags: ["bm25", "hybrid-search", "rrf", "reranking", "query-rewriting", "filters"]
---

# Week 3 — Hybrid Search and Reranking

**Goal by Friday:** a retrieval pipeline that gets recall@5 above 0.85 on your gold set, and a
table showing exactly how much each stage contributed.

This week is where RAG stops being a demo. Four independent improvements, each measured alone.

---

## 1. Concepts (90 min)

### 1.1 Why vectors alone are not enough

Embeddings compress meaning. That is exactly why they lose exact strings:

| Query | Vector search result | What you needed |
| --- | --- | --- |
| `ERR_AUTH_401` | documents about authentication errors, vaguely | **the one** that mentions that code |
| `v2.3.1` | documents about versioning | the changelog entry for 2.3.1 |
| `invoice #88213` | billing documents | that invoice |
| `Qwen2.5-7B` | model docs | the page with that exact model name |

Lexical search (BM25) is the complement: it matches *terms*, weights rare ones heavily, and is
blind to synonyms. Combine them and each covers the other's weakness.

### 1.2 BM25 in one paragraph

BM25 scores a document for a query by summing, over query terms, a term-frequency component
damped by document length, multiplied by how rare the term is across the corpus (IDF). Practical
consequences:

- Rare terms (`ERR_AUTH_401`) dominate — exactly what you want.
- Common terms (`the`, `how`) contribute almost nothing — exactly what you want.
- No training, no GPU, milliseconds. It is 40 years old and still in every serious search stack.

```python
from rank_bm25 import BM25Okapi
bm25 = BM25Okapi([tok(d) for d in documents])
scores = bm25.get_scores(tok(query))
```

### 1.3 Reciprocal Rank Fusion (RRF)

You have two ranked lists with incomparable scores (cosine 0.0–1.0; BM25 0–40). Do not add them.
Fuse by **rank**:

```python
def rrf(rankings: list[list[str]], k: int = 60) -> dict[str, float]:
    fused: dict[str, float] = {}
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking):
            fused[doc_id] = fused.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return fused
```

Why it is the professional default: no score normalisation, no per-corpus tuning, robust when one
retriever is much better than the other. `k=60` is the standard constant — it flattens the
advantage of being rank 1 versus rank 3, which is what you want when two systems disagree.

### 1.4 Reranking: the 80/20 of quality

First stage must be fast and high-recall (retrieve 20–50). Second stage must be slow and precise.

```
hybrid top-50  ──►  cross-encoder rerank  ──►  top-4  ──►  prompt
 (fast, recall)        (slow, precision)
```

A **bi-encoder** (your embedding model) encodes query and document *separately*; similarity is a
dot product. A **cross-encoder** feeds *(query, document)* through the model *together*, so every
query term can attend to every document term. Much more accurate, much slower — which is why it
only ever sees 50 candidates, never 50,000.

Practical options:

| Reranker | Where | Notes |
| --- | --- | --- |
| `BAAI/bge-reranker-v2-m3` | Local, CPU | Strong multilingual default |
| `cross-encoder/ms-marco-MiniLM-L-6-v2` | Local, very fast | Good first reranker |
| Cohere Rerank | API | Excellent, costs money |
| Your provider's rerank endpoint | API | Convenient if you already pay for it |

### 1.5 Query rewriting (cheap, often huge)

Users type badly. Three tricks, in order of payoff:

1. **Strip conversational filler.** "hey so I was wondering, how do I rotate a key?" →
   "rotate a key".
2. **Expand with the corpus's vocabulary.** Ask a model (or use a synonym map) for 3 alternative
   phrasings and search all of them, then fuse.
3. **Decompose multi-part questions.** "How do I rotate a key and what's the downtime?" is two
   searches, not one.

```python
REWRITE = """Rewrite the user's question as a short search query using documentation
vocabulary. Output only the query, no explanation."""

def rewrite(q: str) -> str:
    return chat([{"role": "system", "content": REWRITE},
                 {"role": "user", "content": q}], temperature=0)
```

Cost: one cheap model call (~200 tokens). Benefit: often 5–15 points of recall on messy queries.
Measure it before assuming it helps *your* corpus.

### 1.6 Metadata filters: retrieval with guardrails

Sometimes the right answer is "search less":

```python
col.query(
    query_embeddings=[qv], n_results=20,
    where={"$and": [{"doc_type": "guide"}, {"updated_at": {"$gte": "2025-01-01"}}]},
)
```

Filters are how you prevent the classic RAG failure of citing a deprecated page. They also cut
search cost. But note: **filters reduce recall** — a too-strict filter hides the answer. Test
each filter with your gold set, and prefer storing a `deprecated: true` flag over silently
excluding documents.

---

## 2. Lab — `rag-hybrid` (5 h)

### 2.1 Retrieval interface

Everything below sits behind one function, so you can swap stages and measure:

```python
from dataclasses import dataclass

@dataclass
class Hit:
    id: str
    text: str
    meta: dict
    score: float

def search(question: str, k: int = 20, mode: str = "hybrid") -> list[Hit]:
    """mode: vector | bm25 | hybrid"""
    ...
```

### 2.2 BM25 over the same chunks

```python
import re, numpy as np
from rank_bm25 import BM25Okapi

def tok(s: str) -> list[str]:
    return re.findall(r"[a-z0-9_]+", s.lower())

stored = col.get(include=["documents", "metadatas"])
ids, docs, metas = stored["ids"], stored["documents"], stored["metadatas"]
bm25 = BM25Okapi([tok(d) for d in docs])

def bm25_search(q: str, k: int = 20) -> list[Hit]:
    scores = bm25.get_scores(tok(q))
    order = np.argsort(-scores)[:k]
    return [Hit(ids[i], docs[i], metas[i], float(scores[i])) for i in order if scores[i] > 0]
```

Note the `> 0` filter: BM25 returns 0 for documents sharing no terms. Those are not "weak
matches", they are noise.

### 2.3 Hybrid with RRF

```python
def hybrid_search(q: str, k: int = 20, pool: int = 50) -> list[Hit]:
    dense = vector_search(q, k=pool)          # your Week-1/2 function
    sparse = bm25_search(q, k=pool)
    fused = rrf([[h.id for h in dense], [h.id for h in sparse]])
    by_id = {h.id: h for h in dense + sparse}
    ranked = sorted(fused.items(), key=lambda kv: -kv[1])[:k]
    return [Hit(i, by_id[i].text, by_id[i].meta, s) for i, s in ranked]
```

### 2.4 Add the reranker

```python
from sentence_transformers import CrossEncoder
reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

def rerank(question: str, hits: list[Hit], top_n: int = 4) -> list[Hit]:
    if not hits:
        return []
    scores = reranker.predict([(question, h.text) for h in hits])
    for h, s in zip(hits, scores):
        h.score = float(s)          # overwrite: the reranker's score is what you trust now
    return sorted(hits, key=lambda h: -h.score)[:top_n]
```

Add `max_length=512` when constructing the CrossEncoder if you hit long-chunk warnings. A
cross-encoder truncates silently too.

### 2.5 Measure every stage separately

This table is the deliverable of the week. Run all four configs on the same 25 gold questions:

| config | recall@3 | recall@5 | recall@20 | p50 latency |
| --- | --- | --- | --- | --- |
| vector only | ? | ? | ? | ? |
| BM25 only | ? | ? | ? | ? |
| hybrid (RRF) | ? | ? | ? | ? |
| hybrid + rerank | ? | ? | ? | ? |

One subtlety: **reranking cannot improve recall@20** if it only receives 20 candidates — it
reorders within them. Measure rerank's effect at the k you actually pass to the model (top-4
precision), or retrieve 50 and rerank to 20. Be precise about what each number means; sloppy
eval is worse than no eval.

A practical addition: **precision@4**, i.e. how many of the 4 chunks you send to the model are
actually relevant. That number moves the answer quality far more than recall@20.

### 2.6 Query rewriting, measured

Run the gold set with and without rewriting, on *deliberately messy* queries (add "hey, quick
question —" prefixes, typos, and lowercase-only variants). Record the difference. If rewriting
does not help, do not ship it; it is an extra API call and a failure mode.

### 2.7 The diagnostic you will use forever

For each failure, log the full path: query → rewritten query → vector rank → BM25 rank → fused
rank → rerank score → was the gold doc present?

```
Q: "deploy failed what do i check"
  vector rank 7 | bm25 rank 2 | rrf rank 3 | rerank 0.91 | gold PRESENT at 1
```

When recall is bad, this one table tells you which stage to fix. Build it before you need it.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Query five exact identifiers, vector vs BM25 vs hybrid | Where hybrid earns its keep |
| 2 | Change RRF `k` from 60 to 1 and to 1000 | What the constant actually controls |
| 3 | Rerank 20 candidates vs 50 candidates | Precision needs candidates |
| 4 | Normalise BM25 scores and add them to cosine | Why nobody does this |
| 5 | Add a `doc_type` filter that excludes the gold doc | Filters can hide the answer |
| 6 | Rewrite a 12-word conversational query | Query rewriting, in one example |

---

## 4. Deliverable — `rag-hybrid` on GitHub

- [ ] `retrieve.py` with one `search(mode=...)` interface over vector / bm25 / hybrid
- [ ] `rrf.py` with the fusion function and a unit test on a hand-made example
- [ ] `rerank.py` with a configurable cross-encoder and `top_n`
- [ ] `eval/recall.py` producing the four-config table
- [ ] `eval/trace.py` logging every stage's rank for every question
- [ ] `RESULTS.md` with the table, latencies, and your chosen default config
- [ ] `DECISIONS.md` — one paragraph on why each stage is in or out

**Interview question this earns you:** *"Why hybrid instead of just a better embedding model?"*
— "Because no embedding model reliably matches exact identifiers. A bigger model narrows the gap
but BM25 closes it for free, and RRF needs no score calibration."

---

## 5. Self-check

1. Why can vector search not reliably find `ERR_AUTH_401`?
2. What does RRF use instead of scores, and why is that the right choice?
3. What is the difference between a bi-encoder and a cross-encoder, in one sentence?
4. Why can reranking not fix a recall@20 of 0.4?
5. What does the RRF constant `k` control?
6. When does a metadata filter *hurt* you?

---

## 6. Cheat sheet

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Identifiers never retrieved | Vector-only search | Add BM25 + RRF |
| Hybrid worse than vector | BM25 noise dominating | Increase `k`, or require a BM25 minimum score |
| Reranker changes nothing | All candidates equally bad | Fix the first stage; reranking is not retrieval |
| Reranker very slow | Too many candidates, long chunks | 20–30 candidates, cap length |
| Good recall, bad answers | Top-4 contains only 1 relevant chunk | Increase candidates, tighten chunking |
| Filters hide the answer | Over-restrictive `where` | Loosen, or use a `deprecated` flag instead |
