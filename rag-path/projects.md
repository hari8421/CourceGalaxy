---
title: "Projects & Capstone"
track: "rag"
week: 4
order: 5
type: "project"
hours: 12
summary: "Three RAG builds of increasing ambition, and a capstone that ends with a deployed, citation-backed service and an eval report you can defend."
tags: ["projects", "portfolio", "capstone", "citations", "evaluation"]
---

# Projects & Capstone

Three builds. Each one is a real artefact you can show, not a tutorial you followed.

---

## Project A — `notes-search` (Week 1–2) — *the foundation*

**What it is:** semantic search over your own notes, bookmarks, or a documentation folder. No
generation at all — just a query box and ranked results with titles and snippets.

**Why it matters:** it isolates retrieval, which is where 80 % of RAG quality lives. Without a
generation step to hide behind, you can see exactly how good your chunks are.

**Scope:**

- [ ] Ingest 100+ markdown files with title + heading path in every chunk
- [ ] Brute-force cosine search, then the same behind Chroma
- [ ] 25-question gold set with recall@5 reported
- [ ] A comparison of three chunk sizes
- [ ] A one-page UI (Streamlit) with highlighted snippets

**Stretch:** add BM25 and RRF behind a `mode` toggle, and show the recall difference side by side.

---

## Project B — `docs-qa` (Week 2–4) — *the product*

**What it is:** citation-backed Q&A over a documentation set you actually use, with refusal and
an eval suite.

**Why it matters:** it is the canonical RAG system, and doing it *with numbers* is what separates
you from a tutorial follower.

**Scope:**

- [ ] Hybrid retrieval + reranker, one `search()` interface
- [ ] Answers with inline `[S1]` citations and a code-level refusal gate
- [ ] Eval: recall@5, precision@4, faithfulness, refusal accuracy, latency, cost
- [ ] A "could not answer" report generated from the logs
- [ ] Streamlit UI deployed (Streamlit Community Cloud or a small VM)
- [ ] README with the numbers table and a demo GIF

**Stretch:** add a second corpus (e.g. release notes) and a metadata filter, and measure whether
filtering improves or hurts.

---

## Project C — `ticket-deflector` (Week 3–4) — *the business case*

**What it is:** a support assistant that answers from past resolved tickets, refuses when it has
never seen the issue, and drafts an escalation with the relevant history attached.

**Why it matters:** it forces you to handle real user language — typos, anger, missing context —
and to make the refusal case useful instead of a dead end.

**Scope:**

- [ ] Ingest tickets + resolutions, with the resolution kept adjacent to the problem
- [ ] Query rewriting for messy user language, measured with and without
- [ ] Refusal path that produces a structured escalation (summary + top 5 similar tickets)
- [ ] Eval on 30 real past tickets: did the retrieval find the ticket that actually resolved it?
- [ ] Cost per deflection, compared against a human-handled ticket

**Stretch:** route by intent first (billing / bug / how-to) and use a different prompt per route.
Measure the accuracy gain against the routing errors it introduces.

---

## Capstone — *"Ship a knowledge product"*

One corpus, one service, deployed, with an eval report dated and versioned.

**Day by day:**

| Day | Focus | Exit criterion |
| --- | --- | --- |
| 1 | Corpus + gold set | 25 answerable + 20 unanswerable questions labelled |
| 2 | Ingest + retrieve | recall@5 measured, chunking chosen by data |
| 3 | Hybrid + rerank | Every stage's contribution in a table |
| 4 | Answer + eval | Faithfulness and refusal rates measured |
| 5 | Ship | Deployed URL, numbers table, injection test passing |

**Definition of done:**

- [ ] A stranger can ask it a question and see the source it came from
- [ ] It refuses the unanswerable questions (≥ 17 of 20)
- [ ] Faithfulness ≥ 85 % on 30 sampled answers
- [ ] Every number in the README is reproducible from the repo
- [ ] The prompt-injection test exists and passes
- [ ] Cost per question is stated, and you know which lever moves it
- [ ] A "questions we could not answer" page exists and is current

---

## Portfolio polish

1. **Hook with the numbers:** *"Citation-backed Q&A over 240 docs. recall@5 0.61 → 0.88 with
   heading-aware chunks plus hybrid retrieval; 90 % of answers fully supported; $0.31/1k asks."*
2. **Architecture in ASCII** — parse → chunk → embed → hybrid → rerank → cite.
3. **The retrieval evolution table** — vector, BM25, hybrid, hybrid+rerank, with the delta.
4. **One failure, explained honestly** — a wrong answer, why it happened, what you changed.
5. **The unanswerable list** — shows maturity better than any feature.

---

## The interview script you are building toward

1. *"Walk me through your RAG system."* → corpus, chunking decision, retrieval stages, refusal,
   evaluation. Numbers at each step.
2. *"The answers are wrong. Debug it."* → recall@5 first, then precision@4, then faithfulness.
   Name what each failure implies.
3. *"Why not just put everything in a 1M-token context?"* → cost per query, latency, lost-in-the-
   middle, and the fact that retrieval is also a relevance filter.
4. *"How do you handle documents that contradict each other?"* → recency metadata, both sources
   cited, explicit "sources disagree" path.
5. *"What would you do with 10× the corpus?"* → better chunking and metadata, approximate ANN,
   per-source ranking, and a re-measured gold set.
