---
title: "Week 1 — Embeddings and Vector Search"
track: "rag"
week: 1
order: 1
type: "module"
hours: 12
summary: "What an embedding actually is, why cosine similarity finds meaning, semantic search in 30 lines of NumPy, and how to choose an embedding model with measurements instead of vibes."
tags: ["embeddings", "vector-search", "cosine-similarity", "chromadb", "semantic-search"]
---

# Week 1 — Embeddings and Vector Search

**Goal by Friday:** semantic search over your own documents that works, built twice — once in
raw NumPy so you understand it, once with a vector store so you can scale it — with a small
table comparing three embedding models.

---

## 1. Concepts (90 min)

### 1.1 An embedding is a coordinate for meaning

An embedding model turns text into a list of numbers — typically 384, 768, or 1536 of them:

```python
"cat"   -> [ 0.12, -0.83,  0.44, ...]
"kitten"-> [ 0.15, -0.79,  0.41, ...]   # close
"brick" -> [-0.62,  0.11, -0.77, ...]   # far
```

Nothing in the vector says "animal". The geometry is learned: texts used in similar contexts end
up in similar directions. That is why "how do I reset my password" can match a document titled
"Account recovery steps" with **no shared words**.

Two consequences worth internalising:

- **Embeddings capture meaning, not facts.** They are great at "what is this about", bad at
  "exactly which error code".
- **They are frozen.** Re-embed after changing model, chunking, or text preprocessing, or your
  index and your queries live in different spaces — silently, with terrible results.

### 1.2 Cosine similarity, without the maths anxiety

```python
import numpy as np

def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))
```

It measures the **angle** between two vectors, ignoring length. 1.0 = same direction, 0 = no
relation, -1 = opposite. It is the default because embedding models are trained so that
direction encodes meaning; magnitude is mostly noise.

If your embeddings are L2-normalised (many models do this for you), cosine is just a dot
product — which is why vector databases are fast: it is one matrix multiply.

### 1.3 The three numbers you need to know

| Number | What it means in practice |
| --- | --- |
| **Dimensions** (384/768/1536) | Storage and search cost. 1536 dims × 1M chunks × 4 bytes ≈ 6 GB |
| **Max tokens** (512/8192) | Longer inputs get **truncated**, silently |
| **Cost per 1M tokens** | $0.02 (small hosted) to $0.13 (large hosted) to free (local) |

Truncation is the sneaky one: embed a 3,000-token document with a 512-token model and you have
embedded the first 512 tokens while believing you indexed the whole thing. This is why chunking
(Week 2) exists.

### 1.4 Choosing an embedding model

| Model | Dims | Where | Good for |
| --- | --- | --- | --- |
| `BAAI/bge-small-en-v1.5` | 384 | Local, CPU | The default for learning; fast, good |
| `BAAI/bge-base-en-v1.5` | 768 | Local | A step up in quality, still CPU-friendly |
| `nomic-embed-text-v1.5` | 768 | Local | Long context (8192), multilingual-ish |
| `text-embedding-3-small` | 1536 | OpenAI API | Zero setup, cheap, strong |
| `text-embedding-3-large` | 3072 | OpenAI API | Best hosted quality, more storage |
| `multilingual-e5-large` | 1024 | Local | Non-English corpora |

**Do not choose by benchmark alone.** Choose by measuring on *your* corpus with *your*
questions. That is this week's lab.

### 1.5 The five-line vector index

Before any database, see the whole thing:

```python
import numpy as np

def search(query_vec, doc_vecs, docs, k=5):
    """Brute-force cosine search. Fine up to ~100k documents."""
    scores = doc_vecs @ query_vec / (
        np.linalg.norm(doc_vecs, axis=1) * np.linalg.norm(query_vec) + 1e-9
    )
    top = np.argsort(-scores)[:k]
    return [(docs[i], float(scores[i])) for i in top]
```

That is a vector database. Everything else — Chroma, Qdrant, pgvector, Pinecone — adds
persistence, filtering, approximate nearest-neighbour speed, and operational pain. At 10k
chunks, NumPy is faster than the network round trip.

### 1.6 What vector search is bad at

Test this yourself in the drills, but know it now:

- exact identifiers — `ERR_AUTH_401`, `v2.3.1`, `invoice #88213`
- rare proper nouns — a new product name, a person's surname
- negation and constraints — "documents **without** the word deprecated"
- ordering and numbers — "the third step", "over $500"

Those are lexical problems. Week 3 fixes them with hybrid search.

---

## 2. Lab — `hello-vector` (4 h)

### 2.1 A corpus of 100 documents

Any folder of markdown works. Keep it small enough to read the results and judge them.

```python
from pathlib import Path

docs = []
for p in Path("corpus").rglob("*.md"):
    text = p.read_text(encoding="utf-8", errors="ignore")
    docs.append({"path": str(p), "title": p.stem, "text": text})
print(len(docs), "documents")
```

### 2.2 Embed them locally

```python
from sentence_transformers import SentenceTransformer
import numpy as np

model = SentenceTransformer("BAAI/bge-small-en-v1.5")
texts = [f"{d['title']}\n\n{d['text']}" for d in docs]
vecs = model.encode(texts, normalize_embeddings=True, batch_size=32,
                    show_progress_bar=True).astype(np.float32)
np.save("index/vectors.npy", vecs)
print(vecs.shape)          # (100, 384)
```

`normalize_embeddings=True` makes later cosine a plain dot product. Do it once, here.

### 2.3 Query it

```python
def ask(q, k=5):
    qv = model.encode([q], normalize_embeddings=True)[0]
    scores = vecs @ qv
    for i in np.argsort(-scores)[:k]:
        print(f"{scores[i]:.3f}  {docs[i]['title']}")

ask("how do I rotate an API key")
```

Read the top 5. Are they actually relevant? If two of five are, that is a normal starting point
and Week 2 is where you fix it.

### 2.4 The same thing in Chroma (30 min)

So you recognise the API when you meet it in a job:

```python
import chromadb
client = chromadb.PersistentClient(path="./chroma")
col = client.get_or_create_collection("docs", metadata={"hnsw:space": "cosine"})

col.add(
    ids=[d["path"] for d in docs],
    documents=[d["text"] for d in docs],
    metadatas=[{"path": d["path"], "title": d["title"]} for d in docs],
    embeddings=vecs.tolist(),
)
res = col.query(query_embeddings=[model.encode(["how do I rotate an API key"]).tolist()], n_results=5)
for doc, dist in zip(res["documents"][0], res["distances"][0]):
    print(round(1 - dist, 3), doc[:80].replace("\n", " "))
```

The mental mapping: `add` = index, `query` = search, `metadata` = filters (Week 3), `ids` =
your stable handle. Everything else is vendor detail.

### 2.5 Measure: build a 25-question gold set

This is the single most valuable hour of the week.

```python
# eval/gold.jsonl — one line per question
{"q": "How do I rotate an API key?", "doc": "security/keys.md"}
{"q": "What happens when a deploy fails?", "doc": "ops/deploys.md"}
```

Write 25 questions whose answers you know, from 25 **different** documents. Then:

```python
import json
from pathlib import Path

gold = [json.loads(l) for l in Path("eval/gold.jsonl").read_text().splitlines() if l.strip()]

def recall_at_k(model, k=5):
    hits = 0
    for row in gold:
        qv = model.encode([row["q"]], normalize_embeddings=True)[0]
        top = [docs[i]["path"] for i in np.argsort(-(vecs @ qv))[:k]]
        hits += row["doc"] in top
    return hits / len(gold)

for k in (1, 3, 5, 10):
    print(f"recall@{k}: {recall_at_k(model, k):.2f}")
```

### 2.6 Compare three embedding models

Re-embed and re-measure. Put the result in a table:

| model | dims | recall@1 | recall@5 | embed time | storage |
| --- | --- | --- | --- | --- | --- |
| bge-small | 384 | 0.48 | 0.68 | 4 s | 0.15 MB |
| bge-base | 768 | ? | ? | ? | ? |
| text-embedding-3-small | 1536 | ? | ? | ? | ? |

*Your numbers will differ — that is the point. You now have a baseline and a decision procedure.*

### 2.7 The failure inspection (30 min, do not skip)

Print the 5 questions with the worst retrieval, with their top-3 results and the gold document.
Read them. You will find one of these every time:

- the question uses words the document never uses → **embedding quality or chunk headers**
- the gold document is enormous → **chunking** (Week 2)
- the answer spans two documents → **your gold labels are wrong**, or you need multi-doc retrieval
- the question is an identifier → **hybrid search** (Week 3)

Write the categories down. That list is your work plan for the next two weeks.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Query `ERR_AUTH_401` and a product name | The exact-identifier failure, felt |
| 2 | Embed only the first 200 characters of each doc | Truncation is silent and devastating |
| 3 | Use a model with 384 vs 1536 dims on the same 25 questions | Whether size matters for *your* corpus |
| 4 | Normalise vs don't normalise, then compute cosine | Why the default matters |
| 5 | Delete the title from the embedded text | Titles are an accuracy lever |
| 6 | Time the search at 100 vs 10,000 chunks | When you actually need an index |

---

## 4. Deliverable — `hello-vector` on GitHub

- [ ] `index.py` — parse, embed, save vectors with normalisation
- [ ] `search.py` — brute-force cosine, plus a Chroma implementation behind the same interface
- [ ] `eval/gold.jsonl` — 25 questions, 25 distinct gold documents
- [ ] `eval/recall.py` — recall@1/3/5/10 for any embedder
- [ ] `RESULTS.md` — the three-model comparison table
- [ ] `FAILURES.md` — the five worst questions, classified by cause

**Interview question this earns you:** *"Why is your RAG system giving wrong answers?"* — "I
measure recall@k first. If the gold document is not in the top 5, it is a retrieval problem and
I fix chunking or add hybrid search. Only if recall is healthy do I touch the prompt."

---

## 5. Self-check

1. What does an embedding represent, and what does it *not* represent?
2. Why is cosine similarity preferred over Euclidean distance for text?
3. You switch embedding models. What must you re-do, and what breaks if you forget?
4. Name three query types where pure vector search fails.
5. Why measure recall@5 instead of eyeballing five answers?
6. At what corpus size does brute-force NumPy stop being enough, and why?

---

## 6. Cheat sheet

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| All results look random | Query and documents embedded with different models | Re-embed everything with one model |
| The right doc is always rank 6–8 | Not enough candidates | Retrieve `k=20`, then rerank (Week 3) |
| Long documents never retrieved | Truncation at the model's max tokens | Chunk them (Week 2) |
| Identifiers never found | Semantic search cannot see exact strings | Hybrid search (Week 3) |
| Slow first query | Model loading, not search | Warm up at startup |
| recall@5 stuck at 0.5 | Chunks lack context | Prepend title and heading path |
