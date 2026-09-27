---
title: "Claude Certification — Start Here"
track: "claude"
week: 0
order: 0
type: "overview"
hours: 2
summary: "A 4-week preparation path for Anthropic's Claude certification exams, built around the Developer track with the Architect track as the stretch goal."
tags: ["claude", "anthropic", "certification", "mcp", "exam", "roadmap"]
---

# Claude Certification — Start Here

**Who this is for.** A software developer who already ships code and wants the Claude
credential that maps to the job — not a general AI badge, and not a prompt-engineering
certificate.

**The shape of the program.** Anthropic's Claude Certification Program is run with Pearson
VUE, delivered online-proctored (OnVUE) or at a test centre, in English. There are four
exams across three roles and two levels. They are **partner credentials** — the catalogue
lists them as open to organisations in the Claude Partner Network, with scheduling and
prep courses through the Anthropic Partner Academy. Individual developers can sit them;
confirm your own eligibility and current pricing on the official programme page before you
book anything.

---

## The four exams

| Exam | Code | Role | Questions | Time | Level |
| --- | --- | --- | --- | --- | --- |
| Claude Certified Associate – Foundations | CCAO-F | Practitioner / consultant | 60 | 120 min | Foundations |
| Claude Certified Developer – Foundations | CCDV-F | Developer | 53 | 120 min | Foundations |
| Claude Certified Architect – Foundations | CCAR-F | Architect | 60 (4 scenarios × 15) | 120 min | Foundations |
| Claude Certified Architect – Professional | CCAR-P | Architect | 63 | 120 min | Professional |

**Shared mechanics across all four:** multiple-choice and multiple-response questions, a
scaled score out of 1000 with a **pass mark of 720**, and **12 months of validity**.
Retakes are allowed after 14 days (first failure), 30 days (second), then 90 days, with a
maximum of four attempts per exam in any rolling 12-month period.

> ⚠️ **Verify before you book.** Exam codes, question counts, fees and domain weights are
> published by Anthropic and change. Treat the numbers above as your study scaffold and
> confirm the current spec on the official certification page and the exam guide PDF it
> links to. The exam guide lists the exact sub-objectives — that document is the syllabus,
> and nothing in this path replaces it.

---

## Which one should you take?

| If you are… | Take | Why |
| --- | --- | --- |
| A working developer moving into AI | **Developer – Foundations (CCDV-F)** | Best signal per unit of effort. It is the API-heavy exam and maps to the work you will actually do. |
| Someone who designs systems, or owns an AI roadmap | **Architect – Foundations (CCAR-F)** | Scenario-based. Assumes you can defend orchestration and cost trade-offs. |
| Advising or selling AI to customers | **Associate – Foundations (CCAO-F)** | Product fluency, output validation, responsible use. *Not* easier — just different. |
| Owning a Claude programme across teams | **Architect – Professional (CCAR-P)** | Enterprise scale: governance, lifecycle, stakeholder communication. Do not attempt it without shipping a production system. |

**This path targets Developer – Foundations as the primary exam**, because you are a
developer. Week 5 extends into the Architect material — which is both a second credential
and a genuine promotion path.

---

## Exam content, by domain

### Developer – Foundations (CCDV-F) — 53 questions

| Domain | Weight | What it tests |
| --- | --- | --- |
| **Applications & Integration** | ~33 % | Messages API mechanics, streaming, `stop_reason` handling, retries, rate limits, Batch API, deploying on Bedrock/Vertex |
| Model selection & optimisation | — | Model choice, prompt caching, tokenisation, extended thinking, routing cheap vs capable models |
| Agents & workflows | — | The augmented-LLM loop, `tool_use` → `tool_result` → next turn, when a workflow beats an agent |
| Tools & MCP | — | Tool schema design, `tool_choice` variants, building an MCP server with structured errors |
| Security | ~8 % | Prompt-injection defence, secrets handling, PII redaction before logging |
| Claude Code | small % | Enough to know when a workflow belongs in Claude Code instead of an API integration |

### Architect – Foundations (CCAR-F) — 4 scenarios drawn from a pool of 6

| Domain | Weight |
| --- | --- |
| Agentic Architecture & Orchestration | ~27 % |
| Claude Code Configuration & Workflows | ~20 % |
| Prompt Engineering & Structured Output | ~20 % |
| Tool Design & MCP Integration | ~18 % |
| Context Management | ~15 % |

The published scenario pool: customer support resolution agent · code generation with
Claude Code · multi-agent research system · developer productivity with Claude · Claude Code
in CI · structured data extraction. You are scored on **4 of the 6, drawn at random** — so
prepare all six rather than gambling on your favourite.

### Architect – Professional (CCAR-P) — 63 questions

Adds enterprise depth over Foundations: integration patterns on Bedrock/Vertex (~19 %),
governance, safety and risk management (~14 %), stakeholder communication and lifecycle
management (~14 %), and developer-productivity enablement across an organisation (~7 %).

---

## The 4-week plan

### Week 1 — The Claude platform
Messages API anatomy, content blocks, `stop_reason`, streaming, model families, tokenising,
the SDK's error and retry behaviour.
- **Lab:** `claude-lab`, a CLI that calls the API with retries, streaming, token accounting
  and a live cost meter.
- **Why first:** `stop_reason` alone appears in a large share of the question bank, and
  almost nobody gets it right by guessing.

### Week 2 — Prompt engineering & structured output
Instructions vs system prompts, few-shot design, XML-style structure, prefill, forced tool
choice, extended thinking, and extraction that survives contact with messy documents.
- **Lab:** an extraction pipeline that reports **segmented** accuracy, plus a from-scratch
  prompt-optimisation loop driven by a scored eval set.
- **Why:** the exam repeatedly asks *which mechanism enforces a rule*. Programmatic or
  prompt-based? Getting that distinction right is free points.

### Week 3 — Tools & MCP
Tool schemas, `tool_choice`, the full `tool_use` → `tool_result` cycle, error design, and
building a real MCP server that returns a structured error envelope instead of a stack
trace.
- **Lab:** an MCP server over a real data source, with structured errors and an
  idempotency key on the write path.
- **Why:** expect scenario questions about MCP error envelopes. If you have never written
  one, you are guessing.

### Week 4 — Agents, context & security
The augmented-LLM loop, workflows vs agents, context management and compaction, prompt
caching, the Batch API, subagents and skills, plus prompt-injection defence.
- **Lab:** a bounded agent loop in raw Python, with a token budget, caching, and an
  injection test suite.
- **Why:** this is where the Architect track's Orchestration domain lives too.

### Week 5 — Architect track (stretch)
Orchestration patterns, context isolation, Claude Code configuration (`CLAUDE.md` scoping,
hooks, slash commands, skills), the batch-vs-streaming decision, and enterprise
integration concerns.
- **Lab:** a Claude Code project with `CLAUDE.md`, a pre-commit hook, a custom command, and
  a skill — plus a written architecture decision record.

### Week 6 — Mocks & exam day
Build your own 60-question mock, grade it ruthlessly, maintain an error log, and drill the
question-analysis techniques.
- **Deliverable:** a timed mock, an error log of every question you got wrong and *why*,
  and a final pass over the official exam guide sub-objectives.

### Projects
See `projects.md` — five builds, from a tool-call sandbox to a production agent.

---

## Environment setup (first hour)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install anthropic python-dotenv rich pytest mcp
```

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
```

```python
import os
from anthropic import Anthropic

client = Anthropic()                                  # reads ANTHROPIC_API_KEY
MODEL = os.getenv("ANTHROPIC_MODEL", "sonnet")        # family alias, not a full model id
```

**About model IDs:** Anthropic ships new models frequently and the exact string
(`claude-<family>-<version>-<date>`) changes. Resolve the current IDs from the docs and put
them in environment variables — never hardcode a model string in your code, and never
hardcode one in this path. What is tested is the *decision*: which family for which job.

The Claude Developer Platform is also available on **Amazon Bedrock** and **Google Vertex AI**.
If your employer deploys there, the concepts are identical and only the auth and client
wrapper change. Read at least the authentication and data-residency chapters.

---

## Free official courses

The Anthropic Academy catalogue maps almost one-to-one onto the exam domains. Sequence:

1. **AI Fluency: Framework & Foundations** — the responsible-use vocabulary every track uses.
2. **Claude 101** — the product surface: Projects, artifacts, connectors.
3. **Claude Platform 101** — a ground-up tour, your prerequisite for everything API-shaped.
4. **Building with the Claude API** — Messages API, tool use, RAG, agents. The spine of the
   Developer exam.
5. **Introduction to Model Context Protocol** — build a server end to end in Python. Not
   optional for Developer or Architect.
6. **Model Context Protocol: Advanced Topics** — transports, sampling, notifications.
7. **Introduction to agent skills** and **Introduction to subagents** — direct exam objectives.
8. **Claude Code 101** → **Claude Code in Action** — small weight on Developer, large on Architect.

Plus two primary sources that belong on any serious list: Anthropic's *Building Effective
Agents* (the workflow-vs-agent taxonomy) and the *MCP specification* (read tools, resources
and prompts; skim transports).

---

## Working rhythm

Identical to the other tracks in this repo, because it is the rhythm that works:

| Block | Time | What you do |
| --- | --- | --- |
| Read | 45 min | One module's concepts. Notes only. |
| Build | 2 h | The lab, from the spec. |
| Break | 20 min | Deliberately: force a `max_tokens` stop, kill a tool, inject text into your context. |
| Log | 20 min | Write every exam-style trap you meet into your error log. |
| Commit | 15 min | Ship it, even if it is ugly. |

**Rule that matters more here than anywhere:** if you can *generate* a plausible exam
question about a topic, you understand the objective. If you cannot, you have memorised
instead of learned.

---

## How to use this platform

- The left rail is the curriculum. Progress is stored in your browser.
- Every module ends with a **Lab**, **Deliverable**, and **Self-check**.
- The markdown in this folder is the source of truth — edit it, keep it as your notes.
