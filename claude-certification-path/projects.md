---
title: "Projects & Capstone"
track: "claude"
week: 6
order: 7
type: "project"
hours: 12
summary: "Five builds that produce the muscle memory the Claude exams assume, from a tool sandbox to a production agent with a governance story."
tags: ["projects", "capstone", "portfolio", "mcp", "evals"]
---

# Projects & Capstone

The exams reward muscle memory. Reading about MCP error envelopes does not help; having
written three of them does. **Build these five** — each maps to specific exam domains.

---

## Project 1 — `claude-lab` (Week 1) — *the tool*

**Proves:** you can integrate the Messages API without the classic bugs.

- [ ] `ask()` with SDK + app-level retries, jitter, correct non-retryable handling
- [ ] `text_of()` that walks content blocks rather than indexing `[0]`
- [ ] Explicit `max_tokens`, `refusal`, `tool_use` handling
- [ ] Streaming CLI with a live `stop_reason` + token + dollar line
- [ ] Pre-flight `count_tokens` budget gate
- [ ] `drills.py` provoking every `stop_reason`
- [ ] README: measured cost per 100 calls, per model family

**Best single artefact for a CV line:** *"Claude integration handling all six
`stop_reason` values, streaming, and token-budgeted cost control."*

---

## Project 2 — `extract` (Week 2) — *the evaluation harness*

**Proves:** you optimise prompts with evidence instead of vibes.

- [ ] Forced-tool extraction + prefill variant, with a written rule for choosing
- [ ] ≥ 30 labelled cases across ≥ 4 document types
- [ ] Segmented evaluation: per doc type × per field, plus worst slice
- [ ] `optimize()` over ≥ 5 prompt variants, one variable at a time
- [ ] A results table in the README showing what moved the number
- [ ] One documented case the model gets wrong, with your analysis

---

## Project 3 — `orders-mcp` (Week 3) — *the server*

**Proves:** you can design tools and MCP for a model to use correctly.

- [ ] `search_orders`, `get_order`, `refund_order` with trigger-style descriptions
- [ ] Constrained schemas: `enum`, `pattern`, `minimum`/`maximum`
- [ ] Structured error envelope on every failure; no traceback escapes
- [ ] `alternativeApproaches` populated for business and validation errors
- [ ] Idempotency key + approval ceiling on the write tool
- [ ] `.mcp.json` committed
- [ ] Raw agent loop with step budget, loop detection, always-answered tool results
- [ ] Eval of ≥ 20 cases including must-use **and** must-NOT-use assertions

---

## Project 4 — `agent-ops` (Week 4) — *the production agent*

**Proves:** you can defend a system under cost, latency and attack.

- [ ] All five guards: step budget, cost budget, loop detection, argument screening,
      always-answered tool results
- [ ] Prompt caching with the measured delta
- [ ] Two-tier model router with a measured cost/quality trade-off
- [ ] One subagent with context passed **explicitly**
- [ ] One skill under `.claude/skills/`
- [ ] Injection suite: ≥ 10 attacks, with a written report including anything that got through
- [ ] Cost + latency table: baseline → final

---

## Project 5 — `claude-code-project` (Week 5) — *the architect artefact*

**Proves:** you can configure and roll out Claude tooling for a team.

- [ ] `CLAUDE.md` with conventions and exact build/test commands
- [ ] `PreToolUse` secrets guard + `PostToolUse` formatter
- [ ] `.claude/commands/review.md` — a reusable slash command
- [ ] `.claude/skills/<n>/SKILL.md` with a trigger-focused description
- [ ] `.mcp.json` wired to your Week 3 server
- [ ] 3 ADRs, one page each, consequences stated
- [ ] A model-migration report from your golden set
- [ ] A cost model for a 500-developer rollout

---

## Capstone — *one system, exam-ready, portfolio-grade*

A support-triage agent that reads tickets, uses your MCP tools, drafts replies, and refuses
to take irreversible action without a human. It should be defensible end to end.

**Definition of done:**

- [ ] End-to-end working, deployable, with a URL in the README
- [ ] Every exam domain demonstrable in the code, and pointed at
- [ ] Eval suite with segmented reporting, run in CI
- [ ] Injection suite with an honest report
- [ ] Cost and latency table with before/after
- [ ] ADR set and a one-page threat model
- [ ] **A written answer to each of the six Architect scenarios**, in your own words
- [ ] Two mock exams at ≥ 720/1000, no domain below 70 %

---

## The six scenario answers (write these yourself)

The Architect exam draws 4 of 6. Prepare an answer for each:

1. **Customer support resolution agent** — which pattern, which tools, what fails, what
   needs a human?
2. **Code generation with Claude Code** — how do you configure it so a team gets the same
   behaviour? What is deterministic and what is prompt-level?
3. **Multi-agent research system** — where do you isolate context, and what does a subagent
   *not* inherit?
4. **Developer productivity with Claude** — how do you share skills and MCP servers across a
   large engineering org?
5. **Claude Code in CI** — what belongs in a hook, what in a prompt, and what must never be
   left to the model?
6. **Structured data extraction** — how do you report accuracy so that a human can decide
   to stop reviewing?

Six short answers, written plainly, are worth more than six hours of extra reading.

---

## Portfolio polish (1 h)

1. **One-line hook with a number** — *"Agent triage with 0 unsafe destructive actions across
   40 injection attempts; $0.31 per 1k tickets."*
2. **ASCII architecture** — 10 lines beats a stale diagram.
3. **Screenshots** of the CLI, the MCP tool list, and the injection report.
4. **"What I'd do next"** — demonstrates judgement.
5. **The eval table** in the README — the single most persuasive artefact you own.
6. **Clean commits** — 20 focused commits tell the story.

---

## After the certification

| Direction | What to learn | Why it pays |
| --- | --- | --- |
| **Agent infrastructure** | Durable execution, sandboxes, checkpointing | The hard part of production agents |
| **Evaluation science** | Graders, pairwise ranking, human-in-the-loop labelling | The skill that separates strong practitioners |
| **Fine-tuning** | When RAG and prompting stop being enough | Rare and valuable |
| **Claude Code at scale** | Org-wide rollout, policy-as-code, audit | Directly what the Architect–Professional exam is about |
| **Multimodal** | Vision, documents, screen understanding | Where the next capability jumps are |
| **AI platform / MLOps** | Model gateways, quotas, cost attribution | Where budgets get governed |
