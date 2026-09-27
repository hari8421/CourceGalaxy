---
title: "Week 5 — The Architect Track"
track: "claude"
week: 5
order: 5
type: "module"
hours: 16
summary: "Orchestration at scale, context isolation strategies, Claude Code configuration with hooks and skills, enterprise integration, governance, and lifecycle management."
tags: ["orchestration", "claude-code", "hooks", "enterprise", "governance", "lifecycle", "bedrock", "vertex"]
---

# Week 5 — The Architect Track

**Goal by Friday:** you can defend an architecture decision to a security team, and you can
configure a Claude Code project the whole org benefits from. This is the material behind
both Architect exams.

---

## 1. Concepts (3 h)

### 1.1 The exam's scenario pool

The Architect – Foundations exam draws **4 scenarios from a pool of 6**, 15 questions each.
Knowing the pool tells you what cross-domain fluency to build:

| Scenario | Primary domains |
| --- | --- |
| Customer support resolution agent | Orchestration, MCP, Reliability |
| Code generation with Claude Code | Claude Code, Reliability |
| Multi-agent research system | Orchestration, MCP, Reliability |
| Developer productivity with Claude | MCP, Claude Code, Orchestration |
| Claude Code in CI | Claude Code, Prompt Engineering |
| Structured data extraction | Prompt Engineering, Reliability |

**Prepare all six.** You can afford to lose only your weakest one, and you cannot choose
which it is.

### 1.2 Orchestration — the decisions, not the vocabulary

| Decision | The question you must be able to answer |
| --- | --- |
| Sequential vs parallel | Are these subtasks independent? Fan out, then synthesise |
| Where the state lives | In the conversation, in your database, or in a workflow engine? |
| Fan-out/fan-in | How do you aggregate N results — model-judged, or programmatic? |
| Failure isolation | If one subtask fails, does the whole run fail, or degrade? |
| Context isolation | Subagent, fork, or inline? |
| Human checkpoint | Where does a person need to be in the loop, and before what? |

**The question behind all of them:** *is the branching data-dependent?* If you can draw the
graph in advance, build the graph.

### 1.3 The distinctions the exam leans on

| Concept | Left | Right |
| --- | --- | --- |
| **Enforcement** | Programmatic (hooks, gates) — money, safety, compliance | Prompt-based — style and format |
| **Errors** | Access failure (timeout) → retry | Empty result → no action |
| **Data quality** | Syntax error → fixed by the tool schema | Semantic error → needs a validator |
| **Accuracy** | Aggregate (97 %) — can hide failure modes | Segmented by doc type × field |
| **Config scope** | `~/.claude/CLAUDE.md` — personal, unshared | `<project>/.claude/CLAUDE.md` — team, version-controlled |
| **Session** | Resume — prior context still valid | Fresh start + injected summary — tool results are stale |

**Four instant eliminations** you can apply to almost any question:

1. Anything that puts a **prompt instruction between the user and a financial/safety
   consequence** → eliminate.
2. Anything that hands a subagent an **implicit reference** without passing the content →
   eliminate.
3. Anything that reports **only aggregate accuracy** to justify reducing human review →
   eliminate.
4. Anything that reaches for a routing classifier or tool consolidation **before improving
   tool descriptions** → eliminate. The first move is almost always *"improve the tool
   descriptions."*

### 1.4 Claude Code as a deployment surface

Claude Code is not a chat client; it is an agentic coding tool with four extension points:

| Primitive | File | Purpose |
| --- | --- | --- |
| **Memory** | `CLAUDE.md` | Project instructions, conventions, commands |
| **Hooks** | `.claude/settings.json` | Deterministic shell commands on events |
| **Commands** | `.claude/commands/<name>.md` | Reusable slash commands |
| **Skills** | `.claude/skills/<n>/SKILL.md` | Auto-invoked capability folders |
| **MCP** | `.mcp.json` | Shared tool servers |

```markdown
<!-- CLAUDE.md — the team-shared contract -->
# Project conventions

- Java 21, Spring Boot 3.5. Package by layer: web / service / persistence.
- Constructor injection only. Never `@Autowired` on a field.
- Every public service method that writes needs a test in `...IntegrationTest`.
- Never edit a Flyway migration that has been applied; add a new one.

## Commands
- Build: ./mvnw clean verify
- Test one class: ./mvnw -Dtest=OrderServiceTest test
```

Hooks are the part people under-use, and the exam weights them:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command",
                    "command": "scripts/guard-secrets.sh" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [{ "type": "command", "command": "scripts/format-and-lint.sh" }]
      }
    ]
  }
}
```

**The reasoning to memorise:** a hook is **deterministic**. A prompt instruction asking the
model to "always run the tests" has a non-zero failure rate; a hook that runs them does not.
Use hooks for correctness, prompts for style.

### 1.5 Enterprise integration

| Concern | What you must be able to say |
| --- | --- |
| Platform choice | Direct API (Anthropic), **Amazon Bedrock**, or **Google Vertex AI** — driven by data residency, existing cloud contracts, and procurement |
| Auth | Short-lived credentials, scoped IAM, no long-lived keys in config |
| Data residency | Where prompts and completions physically land, and whether the customer can choose |
| Rate limits | Per-org and per-key limits; design for 429 with backoff and a queue |
| Availability | Multi-region or single region, and what the RTO actually is |
| Cost control | Caching, model routing, budget alarms, per-team quotas |

**The exam question:** *"A regulated customer requires data to stay in the EU. Which
deployment options satisfy this and what must you verify?"* The answer names Bedrock and
Vertex with regional configuration, **and the verification step** — the data-residency
guarantee is a vendor claim you must confirm for their specific region and model.

### 1.6 Governance, lifecycle, and the Professional exam

| Area | What it covers |
| --- | --- |
| **Governance, safety & risk** | Acceptable-use policy, DPIA-style impact assessments, red-team programmes, audit trails, escalation paths |
| **Stakeholder communication** | Framing a Claude programme for a CIO, writing a landing plan, running an incident post-mortem |
| **Lifecycle management** | Pilot → production → deprecation; model migration playbooks when a version is retired; version-pinning strategy |
| **Enablement** | Rolling Claude Code out to hundreds of developers: shared skills, shared MCP servers, path-scoped rules, champions |

**Version pinning is the concrete one:** when a model version is deprecated, you need to know
everywhere you used it, and you need a migration playbook before the deprecation date, not
after. The professional answer is *"I pin model versions explicitly, monitor the deprecation
notices, and run a regression eval against the candidate replacement before switching."*

**Model migration is an eval problem:** run your golden set against old and new, compare
segmented accuracy, and only then cut over. Never upgrade a model and a prompt at the same
time — you will not know which change moved the number.

---

## 2. Lab — the architect deliverables (the week's main build)

### 2.1 Configure a real Claude Code project

- [ ] `CLAUDE.md` with conventions and the exact build/test commands
- [ ] `.claude/settings.json` with a `PreToolUse` guard (secrets) and a `PostToolUse`
      formatter
- [ ] `.claude/commands/review.md` — a reusable review slash command
- [ ] `.claude/skills/migration-check/SKILL.md` — a skill with a trigger-focused description
- [ ] `.mcp.json` pointing at your Week 3 server
- [ ] A short `ARCHITECTURE.md` explaining each decision in one line

### 2.2 Write the decision records

Architecture work is mostly writing down why. Produce three, one page each:

1. **ADR-001 — Workflow, not agent, for invoice processing.** Context: the 30-step process
   is fixed. Decision: deterministic workflow. Consequences: cheaper, testable, and it will
   need redesigning if the steps ever become data-dependent.
2. **ADR-002 — Prompt caching for the reference corpus.** Context: 60 k tokens repeated
   per call. Decision: cache the stable prefix. Consequence: the corpus must be
   byte-identical or the cache silently misses.
3. **ADR-003 — Destructive actions require human approval in code.** Context: prompt-based
   enforcement is not reliable enough for refunds. Decision: the approval ceiling is
   enforced in the tool implementation, not the system prompt.

### 2.3 The migration drill

```python
# Run the same golden set against two model versions before you switch
def migration_report(old_model: str, new_model: str) -> dict:
    old = evaluate(golden_set, lambda q: extract(q, model=old_model))
    new = evaluate(golden_set, lambda q: extract(q, model=new_model))
    return {
        "old": old["overall"], "new": new["overall"],
        "regressed_slices": [k for k, v in new["by_slice"].items()
                             if v < old["by_slice"].get(k, 0) - 0.02],
    }
```

Run it. If `regressed_slices` is non-empty, you have your answer: **do not upgrade yet.**

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Write a question for each of the 6 Architect scenarios | Generating questions proves understanding |
| 2 | Take a config file from `~/.claude/` to `<project>/.claude/` and re-test | Scope changes who gets it |
| 3 | Replace a hook with a prompt instruction; try to break it | Deterministic beats aspirational |
| 4 | Add a red-team case to your injection suite; write the mitigation | Security is a process, not a feature |
| 5 | Draft a one-page DPIA for an agent that reads employee email | Governance, concretely |
| 6 | Plan a model deprecation for a service you built | Lifecycle is a real workstream |
| 7 | Cost a 500-developer Claude Code rollout | Enablement has a budget line |

---

## 4. Deliverable — architect portfolio

- [ ] A configured Claude Code project (CLAUDE.md, hooks, command, skill, MCP)
- [ ] 3 ADRs, one page each, with consequences stated
- [ ] A model-migration report from the golden set
- [ ] A one-page threat model for the agent
- [ ] A cost model for a 500-user rollout
- [ ] Written answers to all six Architect scenarios, in your own words

---

## 5. Self-check

1. A customer requires EU data residency. What do you deploy, and what do you verify?
2. When do you pin a model version instead of tracking latest?
3. Explain hooks vs instructions for "must run tests before commit".
4. A model is deprecated in 90 days. What is your plan, today?
5. An agent handles refunds. Where is the approval ceiling enforced, and why not in the prompt?
6. Which of the four "instant eliminations" applies to each of these: (a) aggregate accuracy
   justifying less human review, (b) a subagent told to "analyse the findings", (c) a
   routing classifier added before improving tool descriptions?

---

## 6. Cheat sheet

| Need | Mechanism |
| --- | --- |
| Deterministic correctness | Hook or gate, never a prompt |
| Style/format behaviour | Prompt + few-shot |
| Share config with the team | `<project>/.claude/…`, version-controlled |
| Personal config | `~/.claude/…` |
| Large subtask isolation | Subagent, payload passed explicitly |
| Stale tool results | Fresh context + injected summary |
| Bulk/offline at half price | Batch API |
| Enterprise data residency | Bedrock/Vertex, region configured and verified |
| Safe model upgrade | Golden-set eval, segmented, before cutover |
| Reducing human review | Segmented accuracy per slice, not aggregate |
