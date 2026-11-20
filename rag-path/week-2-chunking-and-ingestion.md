---
title: "Week 2 — Ingestion and Chunking"
track: "rag"
week: 2
order: 2
type: "module"
hours: 13
summary: "Parse PDFs, HTML and Markdown without losing structure; chunk so a retrieved piece still makes sense alone; keep ids idempotent; and measure the chunk size that wins on your corpus."
tags: ["chunking", "ingestion", "pdf", "metadata", "idempotency", "preprocessing"]
---

# Week 2 — Ingestion and Chunking

**Goal by Friday:** a re-runnable ingest pipeline over a real corpus, where every chunk carries
its source, heading path, and a content hash — and a measured comparison of at least three
chunking strategies against your Week-1 gold set.

Chunking is the highest-leverage, most-skipped step in RAG. Nobody demos it, everybody's quality
depends on it.

---

## 1. Concepts (90 min)

### 1.1 Parsing: get the structure, not just the text

| Source | Tool | What to preserve |
| --- | --- | --- |
| Markdown | direct read | heading hierarchy, code blocks, tables |
| HTML | `trafilatura`, `readability-lxml` | headings, lists, main content (drop nav/footer) |
| PDF (text) | `pypdf` | page numbers, column order if you are lucky |
| PDF (layout matters) | `pymupdf` / `pdfplumber` | tables, positions, headers/footers to strip |
| DOCX | `python-docx` | styles → headings |
| Code | your own splitter | functions/classes, not lines |

```python
from pypdf import PdfReader

def pdf_pages(path: str) -> list[str]:
    reader = PdfReader(path)
    return [(page.extract_text() or "") for page in reader.pages]
```

**Always store the page number.** A citation that says "somewhere in this 300-page manual" is
not a citation. `pypdf` gives you this for free; a naive full-text dump throws it away.

Two parsing traps that will eat a day if you let them:

- **Headers and footers repeat on every page.** Chunk them and you have 300 copies of your
  company name competing with real content. Strip lines that appear on >60 % of pages.
- **PDF text extraction reorders columns.** Two-column papers come out interleaved. Check one
  output page before trusting 300.

### 1.2 Chunking strategies, honestly compared

| Strategy | How it works | Best for | Weakness |
| --- | --- | --- | --- |
| **Fixed size** | 800 chars, hard cut | "ship today" | splits sentences and tables mid-row |
| **Recursive** | split on `\n## `, then `\n\n`, then sentences, fill to size | general default | boundaries ignore meaning |
| **Structure-aware** | one chunk per section/function | docs, code, HTML | some chunks tiny, some huge |
| **Semantic** | split where adjacent sentence embeddings diverge | narrative prose | slower, needs tuning, not always better |
| **Parent/child** | retrieve small chunk, return its parent section | long documents | more storage, more code |
| **Sentence-window** | retrieve a sentence, return N neighbours | precise Q&A | more moving parts |

Start with **recursive, 600–1000 tokens, 10–15 % overlap**. Then measure. Almost nobody needs
semantic chunking, and almost everybody needs structure-aware chunking for documentation.

### 1.3 The header trick (the cheapest win in RAG)

A chunk that reads "…set the flag to true and restart the service" is useless out of context.
The same chunk with a header is findable:

```python
chunk = f"""Source: {doc_title}
Section: {heading_path}

{body}"""
```

Why it works: the embedding now contains the *topic words* the user will actually type. This one
change routinely moves recall@5 by 10–20 points on real corpora. Measure it — that is a drill.

### 1.4 Sizing, with actual numbers

| Chunk tokens | Retrieval | Answer quality | Risk |
| --- | --- | --- | --- |
| 128–256 | Very precise | Fragmentary, missing context | Answer not in one chunk |
| **400–800** | Good balance | Usually complete | The default choice |
| 1,000–2,000 | Fewer, broader hits | More context, more noise | Dilutes the prompt, costs tokens |
| Whole document | Terrible | Terrible | Useless embeddings |

Tokens, not characters: an embedding model's limit is in tokens, and prompt cost is in tokens.
Rough conversion: **1 token ≈ 4 characters of English**.

### 1.5 Metadata is what makes RAG a product

Attach at minimum:

```python
meta = {
    "source": str(path),          # file path or URL
    "title": doc_title,
    "section": " > ".join(headings),
    "page": page_number,          # for PDFs
    "chunk_index": i,
    "hash": content_hash,         # idempotent re-indexing
    "updated_at": iso_date,       # freshness filters
    "doc_type": "guide",          # filter by kind
}
```

Every one of these pays for itself: `source` and `page` for citations, `section` for display,
`hash` for updates, `updated_at` for "only search current docs", `doc_type` for filtered search.

### 1.6 Idempotent ingestion (the habit that saves your sanity)

You will re-run ingest dozens of times. Two rules:

1. **Deterministic ids.** `sha1(f"{source}:{chunk_index}:{text[:80]}")` — the same chunk gets the
   same id every run.
2. **Upsert, never insert.** Re-running updates changed chunks, leaves unchanged ones alone, and
   does not duplicate.

```python
col.upsert(ids=ids, documents=texts, metadatas=metas, embeddings=vecs)
```

Then handle deletions: collect the ids present this run, and remove any stored id for that source
that is no longer present. Otherwise your index slowly fills with the ghosts of deleted
paragraphs — and they will be retrieved, and they will be wrong.

---

## 2. Lab — `rag-ingest` (5 h)

### 2.1 A structure-aware Markdown chunker

```python
import hashlib, re
from pathlib import Path

MAX_CHARS = 3000      # ~750 tokens
OVERLAP = 300         # ~10 %

def split_markdown(text: str, path: str) -> list[dict]:
    """One chunk per ## section, split further if long, with the heading path kept."""
    title = next((l.lstrip("# ").strip() for l in text.splitlines() if l.startswith("# ")), Path(path).stem)
    # split on level-2 headings, keeping the heading with its body
    parts = re.split(r"\n(?=## )", text)
    chunks = []
    for part in parts:
        heads = re.findall(r"^#{1,3}\s+(.+)$", part, re.M)
        section = " > ".join(h.strip() for h in heads) or "intro"
        body = part.strip()
        if not body:
            continue
        # long sections: slide a window with overlap
        start = 0
        while start < len(body):
            piece = body[start:start + MAX_CHARS]
            chunks.append({
                "text": f"Source: {title}\nSection: {section}\n\n{piece.strip()}",
                "title": title,
                "section": section,
                "chunk_index": len(chunks),
            })
            if start + MAX_CHARS >= len(body):
                break
            start += MAX_CHARS - OVERLAP
    return chunks
```

### 2.2 Add PDFs with pages

```python
from pypdf import PdfReader

def split_pdf(path: str) -> list[dict]:
    reader = PdfReader(path)
    out = []
    for page_no, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if len(text) < 80:                     # scanned page, no text layer
            continue
        for start in range(0, len(text), MAX_CHARS - OVERLAP):
            piece = text[start:start + MAX_CHARS]
            out.append({
                "text": f"Source: {Path(path).name} (page {page_no})\n\n{piece}",
                "title": Path(path).stem,
                "section": f"page {page_no}",
                "page": page_no,
                "chunk_index": len(out),
            })
    return out
```

**Scanned PDFs have no text layer.** `extract_text()` returns empty. That needs OCR
(`pytesseract` + `pdf2image`) — decide deliberately whether it is worth it, because OCR errors
pollute retrieval just as badly as missing text.

### 2.3 Ingest with hashes

```python
import hashlib, json, numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer
import chromadb

embedder = SentenceTransformer("BAAI/bge-small-en-v1.5")
client = chromadb.PersistentClient(path="./chroma")
col = client.get_or_create_collection("docs", metadata={"hnsw:space": "cosine"})

def ingest(root="corpus"):
    chunks = []
    for p in Path(root).rglob("*"):
        if p.suffix == ".md":
            chunks += split_markdown(p.read_text(encoding="utf-8"), str(p))
        elif p.suffix == ".pdf":
            chunks += split_pdf(str(p))
    if not chunks:
        return 0
    texts = [c["text"] for c in chunks]
    ids = [hashlib.sha1(f"{c['title']}:{c['chunk_index']}:{c['text'][:80]}".encode()).hexdigest()[:16]
           for c in chunks]
    metas = [{k: v for k, v in c.items() if k != "text"} for c in chunks]
    vecs = embedder.encode(texts, normalize_embeddings=True, batch_size=32,
                           show_progress_bar=True).tolist()
    col.upsert(ids=ids, documents=texts, metadatas=metas, embeddings=vecs)
    Path("index/chunks.json").write_text(json.dumps(chunks[:5], indent=2))
    return len(chunks)

print(ingest(), "chunks indexed")
```

Run it twice. The second run must produce the **same count**, not double. That is your
idempotency test, and it is worth a line in your README.

### 2.4 Measure three strategies

Use the 25 gold questions from Week 1. Re-ingest each time (or use three collections) and record:

| Strategy | chunk size | overlap | chunks | recall@5 | avg tokens/answer |
| --- | --- | --- | --- | --- | --- |
| fixed | 3000 chars | 0 | ? | ? | ? |
| recursive + headers | 3000 | 300 | ? | ? | ? |
| recursive, no headers | 3000 | 300 | ? | ? | ? |
| small + headers | 1200 | 150 | ? | ? | ? |

The header row is the one that surprises people. The "no headers" row is the control that proves
the headers are doing the work.

### 2.5 Inspect your chunks like a reviewer

Print five random chunks in full. For each, ask:

- Would this make sense to someone who has not read the document? (If no, the header is missing
  or the chunk is too small.)
- Does it end mid-sentence? (Overlap too small.)
- Is it a table rendered as unreadable columns? (Needs table-aware handling.)
- Is it 90 % boilerplate? (Strip boilerplate before chunking.)

Fix what you find. This 20-minute review is worth more than any hyperparameter.

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Remove chunk headers, re-measure recall@5 | The header effect, quantified |
| 2 | Chunk at 300 / 800 / 2000 tokens | Where the curve turns for your corpus |
| 3 | Set overlap to 0 | Why 10–15 % exists |
| 4 | Ingest twice without clearing | Idempotency, or the lack of it |
| 5 | Delete a source file and re-ingest | Ghost chunks: the silent quality killer |
| 6 | Chunk a table-heavy PDF and read the output | Why layout-aware parsing exists |

---

## 4. Deliverable — `rag-ingest` on GitHub

- [ ] `ingest.py` — Markdown + PDF, deterministic ids, upsert, deletion handling
- [ ] `chunkers.py` — at least two strategies behind one interface
- [ ] `metadata.md` — every field you store, and what uses it
- [ ] `RESULTS.md` — the four-strategy comparison table from 2.4
- [ ] `index/stats.json` — chunk count, token distribution, sources covered
- [ ] A `--dry-run` flag that prints chunk previews without writing

**Interview question this earns you:** *"Our RAG misses answers that are clearly in the docs.
Where do you look?"* — "Chunking. I check whether the retrieved chunk contains the answer but
lacks the context to be found, and whether the answer got split across a boundary. Then I check
that the document was parsed at all."

---

## 5. Self-check

1. Why is a header prepended to every chunk not "cheating"?
2. What happens to a 3,000-token document with a 512-token embedding model?
3. Why deterministic ids, and what breaks without them?
4. Name two parsing problems that survive into your index and hurt retrieval.
5. What is the trade-off between 200-token and 2,000-token chunks?
6. How do you handle deleted documents in an upsert-only pipeline?

---

## 6. Cheat sheet

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Chunk count doubles every ingest | No stable ids | Content-hash ids + `upsert` |
| Answers cite deleted content | No deletion sweep | Track ids per source; remove the rest |
| Tables come out as gibberish | Naive text extraction | Layout-aware parser, or table-aware chunking |
| Right section, missing context | Chunk too small, no overlap | Raise size, add 10–15 % overlap |
| Empty chunks from a PDF | Scanned pages, no text layer | OCR, or exclude and note it |
| Retrieval finds boilerplate | Headers/footers indexed | Strip repeated lines before chunking |
