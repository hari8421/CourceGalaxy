---
title: "Week 2 — Retrieval & RAG"
track: "ai"
week: 2
order: 2
type: "module"
hours: 18
summary: "Chunking, embeddings, vector search, hybrid retrieval, rerankers, and a citation-backed RAG app with a recall@k eval harness."
tags: ["rag", "embeddings", "vector-search", "chunking", "retrieval", "citations"]
---

# Week 2 — Retrieval & RAG

**Goal by Friday:** a Q&A system over a real corpus of your own documents that cites its
sources, refuses when the answer is not in the corpus, and reports a **recall@k number** you
measured yourself.

---

## 1. Concepts (1 h)

### 1.1 The problem RAG solves

Models do not know your data, cannot be retrained per customer, and hallucinate confidently
when asked about facts they lack. **Retrieval-Augmented Generation** fixes this: find the
relevant text first, paste it into the prompt, and instruct the model to answer *only* from
it.

```
question ──► embed ──► vector search ──► top-k chunks ──┐
                                                        ├─► prompt ─► answer + citations
question ──► BM25 keyword search ──► top-k chunks ──────┘
```

### 1.2 Why "just put the docs in the prompt" is not RAG

| Approach | Context cost | Works for |
| --- | --- | --- |
| Stuff everything | 100 % of corpus, blows the window on day one | A 3-page FAQ |
| **Retrieve top-k** | ~2–5 % of corpus, scales to millions of docs | Everything real |
| Fine-tuning | High one-off cost, no fresh facts | *Style and format*, not knowledge |

Rule of thumb: **RAG for facts, fine-tuning for behaviour.**

### 1.3 Chunking — the highest-leverage, most-skipped step

Bad chunks are the number one cause of bad RAG. Chunking trade-offs:

| Strategy | How | Use when |
| --- | --- | --- |
| **Fixed** | Every 500 tokens, hard cut | You must ship today |
| **Recursive character** | Split on headings/paragraphs, then fill to size | General-purpose default |
| **Structure-aware** | One chunk = one section/function/class | HTML, Markdown, code, PDFs with headings |
| **Semantic** | Split where adjacent-sentence embeddings diverge | Narrative text, high-stakes accuracy |
| **Parent/child (small-to-big)** | Retrieve a small chunk, feed the bigger parent | Long documents where context matters |
| **Agentic** | The model picks the boundaries | Expensive; only for messy corpora |

**Rules that matter:** keep 10–15 % overlap so a sentence is not cut in half; never split
mid-code-block or mid-table; prepend **document title + heading path** to every chunk — it
is the cheapest accuracy win in the entire discipline.

```python
# The chunk header that makes retrieval dramatically better
chunk_text = f"Source: {doc.title}\nSection: {' > '.join(headings)}\n\n{body}"
```

### 1.4 Vector search and its blind spot

Pure vector search matches *meaning*, which means it is bad at:

- exact identifiers — error codes, order numbers, `ERR_AUTH_401`, function names
- rare proper nouns — product names, people's names
- precise filters — "invoices from 2024 over $500"

Those are **keyword** problems. So use **hybrid search**: BM25 (lexical) + vectors
(semantic), merged with Reciprocal Rank Fusion:

```python
def reciprocal_rank_fusion(rankings: list[list[str]], k: int = 60) -> dict[str, float]:
    """RRF: rank position matters more than raw scores from any one system."""
    fused: dict[str, float] = {}
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking):
            fused[doc_id] = fused.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return fused
```

RRF is the default professional answer because it needs **no score normalisation** between
BM25 and cosine, which is where naive merges fall apart.

### 1.5 Reranking: the 80/20 of quality

Retrieve 20 candidates with hybrid search, then pass them through a **reranker model** (a
small, purpose-trained cross-encoder) that scores each *(question, chunk)* pair jointly.
Reranking is slower but dramatically more accurate than embedding similarity.

```
hybrid top-20  →  rerank  →  top-4  →  prompt
   (fast, recall)          (slower, precision)
```

### 1.6 Citations and refusal — the trust layer

Two behaviours separate a demo from a product:
1. **Cite** the chunk ids you used, inline, so a human can verify in one click.
2. **Refuse** when retrieval is weak. Never let the model fill the gap from its parametric
   memory — that is exactly how RAG systems produce confident, citation-free fiction.

---

## 2. Lab — `rag-docs` (the week's main build)

### 2.1 Stack

```bash
pip install chromadb sentence-transformers rank-bm25 pydantic
```

Chroma for the vector store (in-memory, zero config), `rank_bm25` for lexical search.

### 2.2 Ingest (`ingest.py`)

```python
from pathlib import Path
import hashlib, re, chromadb
from langchain_text_splitters import RecursiveCharacterTextSplitter  # or hand-rolled
from openai import OpenAI

client = OpenAI()
splitter = RecursiveCharacterTextSplitter(
    chunk_size=800, chunk_overlap=120,
    separators=["\n# ", "\n## ", "\n\n", "\n", ". ", " "],
)
client_ = chromadb.PersistentClient(path="./chroma")
col = client_.get_or_create_collection("docs")


def embed(texts: list[str]) -> list[list[float]]:
    out = []
    for i in range(0, len(texts), 128):                    # batch for speed + rate limits
        r = client.embeddings.create(model="text-embedding-3-small", input=texts[i:i + 128])
        out.extend(d.data.embedding for d in r.data)
    return out


def chunk_markdown(path: Path) -> list[dict]:
    raw = path.read_text()
    title = raw.splitlines()[0].lstrip("# ").strip()
    pieces, headings = [], []
    for block in splitter.create_documents([raw]):
        # Track the heading path so every chunk self-describes.
        found = re.findall(r"^#{1,3}\s+(.+)$", block.page_content, re.M)
        headings = (headings + found)[-3:]
        pieces.append({
            "text": f"Source: {title}\nSection: {' > '.join(headings) or 'intro'}\n\n{block.page_content}",
            "meta": {"file": str(path), "heading": " > ".join(headings), "title": title},
        })
    return pieces


def ingest(root: Path = Path("corpus/")) -> int:
    docs, metas, ids = [], [], []
    for path in root.rglob("*.md"):
        for i, c in enumerate(chunk_markdown(path)):
            docs.append(c["text"]); metas.append(c["meta"])
            ids.append(hashlib.sha1(f"{path}:{i}:{c['text'][:80]}".encode()).hexdigest()[:16])
    if not docs:
        return 0
    col.upsert(ids=ids, documents=docs, metadatas=metas, embeddings=embed(docs))
    return len(docs)
```

**Idempotency matters:** content-hash ids mean re-running ingest updates rather than
duplicates. You will thank yourself on day two of iteration.

### 2.3 Hybrid retrieval + rerank (`retrieve.py`)

```python
import numpy as np
from rank_bm25 import BM25Okapi

class Retriever:
    def __init__(self):
        got = col.get(include=["documents", "metadatas"])
        self.ids, self.docs = got["ids"], got["documents"]
        self.bm25 = BM25Okapi([d.lower().split() for d in self.docs])

    def search(self, question: str, k: int = 20) -> list[dict]:
        dense = col.query(query_embeddings=[embed([question])[0]], n_results=k)
        q_tokens = question.lower().split()
        sparse_scores = self.bm25.get_scores(q_tokens)
        sparse_order = np.argsort(-sparse_scores)[:k]

        dense_ids = dense["ids"][0]
        rankings = [dense_ids, [self.ids[i] for i in sparse_order]]
        fused = reciprocal_rank_fusion(rankings)

        ranked = sorted(fused.items(), key=lambda kv: -kv[1])[:k]
        return [{"id": i, "rrf": s, **_meta(i)} for i, s in ranked]

    def rerank(self, question: str, candidates: list[dict], top_n: int = 4):
        """Cheap local rerank: lexical overlap on rare terms. Swap in a cross-encoder later."""
        q = set(question.lower().split())
        for c in candidates:
            d = set(c["text"].lower().split())
            c["lexical"] = len(q & d) / (len(q) or 1)
        return sorted(candidates, key=lambda c: -c["lexical"])[:top_n]
```

**Honest note:** that reranker is a stand-in. Do it once with a real reranker model
(`bge-reranker-v2-m3`, Cohere Rerank, or your provider's rerank endpoint) and record the
delta in your eval table. Seeing the number is the lesson.

### 2.4 Answer with citations (`answer.py`)

```python
ANSWER_SYSTEM = """You answer ONLY from the numbered CONTEXT below.
Rules:
- Cite every claim as [S1] or [S2] matching the source number.
- If the context does not contain the answer, reply exactly: NOT_IN_CONTEXT
- Never use outside knowledge. Never guess a number, date, or name."""

def answer(question: str, retriever: Retriever, threshold: float = 0.15):
    cands = retriever.search(question, k=20)
    top = retriever.rerank(question, cands, top_n=4)

    # Guard rail: weak retrieval -> refuse before the model is even called.
    if not top or top[0].get("lexical", 0) < threshold:
        return {"answer": "I could not find that in the documentation.",
                "citations": [], "refused": True}

    context = "\n\n".join(f"[S{i+1}] {c['text']}" for i, c in enumerate(top))
    reply = chat([
        {"role": "system", "content": ANSWER_SYSTEM},
        {"role": "user", "content": f"CONTEXT:\n{context}\n\nQUESTION: {question}"},
    ], temperature=0.0)
    return {"answer": reply, "citations": [c["meta"] for c in top], "refused": False}
```

### 2.5 Measure retrieval before you touch the prompt (3 h)

Fixing a prompt when retrieval is broken is cargo-cult tuning. **Measure retrieval first.**

```python
# eval_retrieval.py — label 25 questions with the doc that contains the answer
GOLD = [("How do I rotate my API key?", "security.md"), ...]

def recall_at_k(k: int) -> float:
    hits = 0
    for q, gold_file in GOLD:
        got = [c["meta"]["file"] for c in retriever.search(q, k=k)[:k]]
        hits += gold_file in got
    return hits / len(GOLD)
```

Run it for `k = 3, 5, 10, 20` and with/without hybrid search and reranking. Print a table:

| config | recall@3 | recall@5 | recall@20 |
| --- | --- | --- | --- |
| vector only | 0.52 | 0.68 | 0.84 |
| BM25 only | 0.44 | 0.60 | 0.80 |
| hybrid (RRF) | 0.68 | 0.80 | 0.92 |
| hybrid + rerank | **0.76** | **0.88** | 0.96 |

*Your numbers will differ — that is the point. You now have a baseline and a direction.*

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Ingest the same corpus at chunk sizes 300 / 800 / 2000; record recall@5 for each | Chunk size is a tunable, not a constant |
| 2 | Ask 5 questions with **identifiers** (`ERR_AUTH_401`) — vector-only vs hybrid | Hybrid search earns its keep |
| 3 | Delete all chunk headers and re-measure recall | Titles/headings are a huge accuracy lever |
| 4 | Ask 5 questions **not** in the corpus; verify the system refuses | Refusal is a feature you must test |
| 5 | Compute the answer **without** retrieval and count fabrications | Quantifies the value you added |
| 6 | Log prompt tokens for every query; find the top-5 costliest questions | Cost is a data problem, not a mystery |

---

## 4. Deliverable — `rag-docs` on GitHub

- [ ] Ingest script with content-hash ids and chunk metadata
- [ ] Hybrid retrieval (vector + BM25 + RRF) behind a single `search()` API
- [ ] Reranking step (real reranker model, not the stand-in)
- [ ] Answering with inline `[S1]` citations and a real refusal path
- [ ] `eval_retrieval.py` printing recall@k for ≥ 25 labelled questions across ≥ 2 configs
- [ ] A tiny web UI (Streamlit is fine — 40 lines) so a non-technical person can try it
- [ ] README table showing the recall improvement from your changes

**Interview question this earns you:** *"Our RAG answers are wrong. Walk me through how you
localise the fault between retrieval and generation."* (Answer: measure recall@k first. If
recall is fine, it is generation. If not, it is chunking or the embedder.)

---

## 5. Self-check

1. What retrieval failure did you observe this week, and what config change fixed it?
2. Why does RRF beat naive score addition for hybrid search?
3. When would you choose semantic chunking over fixed-size, and what does it cost you?
4. Your system answers correctly but with invented supporting facts. Which layer is broken?
5. How would you keep a user from getting an answer that is technically in your corpus but
   legally misleading? (Start: keep the source id and the retrieval score on every answer so
   a human or an audit job can re-check it.)

---

## 6. Cheat sheet

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Right topic, wrong section | Chunks lack context | Prepend title + heading path |
| Exact IDs not found | Pure vector search | Add BM25 / hybrid |
| Good recall, bad answers | Too many chunks, no instruction | Top-4 not top-20; stricter system prompt |
| Answers ignore context | Context truncated | Count tokens; raise limit or compress |
| Latency > 3 s | Reranking on 50 candidates | Reduce candidates; cache embeddings |
| Cost explodes | Long chunks, top-k too high | Smaller chunks, k=4, prompt caching |
