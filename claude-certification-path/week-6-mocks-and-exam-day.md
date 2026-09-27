---
title: "Week 6 — Mocks & Exam Day"
track: "claude"
week: 6
order: 6
type: "module"
hours: 12
summary: "Build your own 60-question mock, maintain an error log, drill the question-analysis techniques, and run a timed final rehearsal."
tags: ["mock-exam", "exam-day", "error-log", "question-analysis", "time-management"]
---

# Week 6 — Mocks & Exam Day

**Goal by Friday:** you have sat two full timed mocks, your error log is written, and every
question you missed has a documented reason.

---

## 1. Concepts (1.5 h)

### 1.1 The format, restated as a strategy

| Mechanic | Value |
| --- | --- |
| Duration | 120 minutes |
| Question types | Multiple choice **and** multiple response (often "select two") |
| Score | Scaled 100–1000 |
| Pass mark | **720** |
| Validity | 12 months |
| Attempts | 4 per 12 months, with 14 / 30 / 90-day waits after failures |

**Budget your time:** 120 minutes for ~53–63 questions. If you are averaging over 2
minutes per question you will run out — which is worse than running short, because a
question you skip is a question you cannot revise. Mark and move at the halfway point.

> Verify all of the above against the current official exam guide before you book. Question
> counts and policy details are published by Anthropic and do change.

### 1.2 Multiple-response is where points are lost

"Select TWO" questions punish both over- and under-selection. The discipline:

1. Read the *last sentence* first — it usually states how many answers are wanted.
2. Find the option that is **unambiguously correct**. Select it.
3. Find the option that is **unambiguously wrong**. Exclude it.
4. Decide between the remaining candidates only if one is clearly better.

**Never leave a multiple-response blank** unless you are out of time — a blank is worth
nothing, and a reasoned guess is often partial credit.

### 1.3 The question-analysis technique

Most hard questions reduce to a few repeatable moves.

**Step 1 — classify the question type:**

| Type | What it wants |
| --- | --- |
| Mechanism selection | Which API feature / configuration enforces this rule? |
| Scenario diagnosis | Given this symptom, what is the actual cause? |
| Trade-off judgement | Two good options — which wins, and under what condition? |
| Boundary case | What happens at the edge (empty, timeout, max tokens)? |
| Design review | Given this design, what is the flaw? |

**Step 2 — apply the eliminations:**

1. A prompt instruction standing between the user and a **financial or safety consequence** →
   eliminate.
2. A subagent given an **implicit reference** without the content → eliminate.
3. **Aggregate accuracy alone** used to justify reducing human review → eliminate.
4. A routing classifier or tool consolidation proposed **before improving tool
   descriptions** → eliminate.
5. A **retry proposed for a deterministic failure** (`max_tokens`, `400`, `401`) → eliminate.

**Step 3 — state your answer in one sentence before selecting.** If you cannot, you are
guessing, and a guess is how you lose 200 points.

### 1.4 The error log — the single highest-value artefact

Every question you get wrong produces an entry. Not just the answer: the **reason**.

```markdown
## Q: 42 — "Team must always get the shared lint rules. Where do they go?"

- **My answer:** ~/.claude/CLAUDE.md
- **Correct:** <project>/.claude/CLAUDE.md
- **Why I was wrong:** I read "the team" and reached for the file I personally edit.
  Personal scope is ~/.claude/*; team scope is <project>/.claude/*.
- **Rule to remember:** "the whole team" → project scope. "just my machine" → home scope.
- **Domain:** Claude Code Configuration
- **Would I get it now? yes
```

Re-read the error log the day before the exam. It is worth more than any practice test,
because it contains *your* specific misconceptions rather than a generic syllabus.

### 1.5 Building your own mock

You cannot buy the real item, so generate one. The act of **writing** a plausible question is
itself the strongest study signal: if you cannot generate a question about a topic, you have
memorised it rather than learned it.

```python
# mock/generate.py — a question bank you author, typed and scored
QUESTION_BANK = [
    {
        "id": "Q01",
        "domain": "Applications & Integration",
        "type": "mechanism",
        "stem": "A client sets max_tokens=100 and a long answer is cut off mid-sentence. "
                "The integration retries with identical parameters and fails identically. "
                "What is the correct fix?",
        "options": [
            "A) Increase temperature so the model produces different output",
            "B) Raise max_tokens, or split the task; do not retry unchanged",
            "C) Switch to a different model family",
            "D) Add a retry with exponential backoff",
        ],
        "answer": "B",
        "trap": "D is the reflex answer for an error; this failure is deterministic.",
    },
    # ... 60 of them, weighted to your exam's domains
]

def run_mock(bank, minutes=120):
    per_question = minutes * 60 / len(bank)
    results = []
    for q in bank:
        start = time.perf_counter()
        chosen = ask_user(q)                 # your own answering interface
        elapsed = time.perf_counter() - start
        results.append({**q, "chosen": chosen, "ok": chosen == q["answer"],
                        "seconds": elapsed,
                        "over_budget": elapsed > per_question})
    return {
        "score": sum(r["ok"] for r in results) / len(results),
        "by_domain": domain_breakdown(results),
        "slowest": sorted(results, key=lambda r: -r["seconds"])[:10],
    }
```

Report by domain, and by time. A 78 % score with a 45 % on *Tools & MCP* means you are not
ready, whatever the average says.

---

## 2. Lab — the final rehearsal (the week's main build)

### 2.1 Three mock attempts, escalating

| Mock | When | What you change |
| --- | --- | --- |
| **Mock 1** | Start of the week | Untimed, 40 questions. Learn the shape. |
| **Mock 2** | Mid-week | 60 questions, **120-minute hard limit**. First real rehearsal. |
| **Mock 3** | 48 h before | Full length, no notes, in one sitting. Final dress rehearsal. |

### 2.2 Run it, then do the work that actually matters

```python
report = run_mock(QUESTION_BANK, minutes=120)

print(f"score: {report['score']:.0%}")
for domain, acc in report["by_domain"].items():
    flag = "  <-- below 70%" if acc < 0.70 else ""
    print(f"  {domain:34} {acc:.0%}{flag}")
print("\nslowest questions (time management):")
for r in report["slowest"][:5]:
    print(f"  {r['id']}  {r['seconds']:5.0f}s  {r['stem'][:50]}")
```

**Pass mark target:** you are consistently clearing **720/1000** (roughly 72 %) on two
consecutive mocks, with no domain below 70 %, before you book a real attempt. Anything less
and the 14-day retake window is a wasted month.

### 2.3 Final checklist (the night before)

- [ ] Error log re-read end to end
- [ ] Every mock domain ≥ 70 %
- [ ] `stop_reason` table recalled from memory, cold
- [ ] `tool_choice` four variants recalled from memory, cold
- [ ] Structured MCP error envelope written out from memory
- [ ] Programmatic-vs-prompt table recalled
- [ ] Config scope split (`~/.claude/` vs `<project>/.claude/`) instant
- [ ] Official exam guide sub-objectives re-read, anything unfamiliar flagged
- [ ] ID / payment method ready, system test run, domains from the Pearson list confirmed
      reachable
- [ ] Sleep. Tired candidates misread questions they know.

---

## 3. Practical drills (1 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Write 20 questions for Tools & MCP | Generating = understanding |
| 2 | Explain every option in a question you got wrong | Traps teach more than answers |
| 3 | Time 10 questions; find your slowest domain | Time is a skill, not a gift |
| 4 | Re-do only the ones you missed, 3 days later | Spaced retry is where it sticks |
| 5 | Write a question whose answer is "improve the tool descriptions" | Find the recurring meta-answer |
| 6 | Cold-recall the two tables, no notes | The tables are free points |

---

## 4. Deliverable — the mock dossier

- [ ] A 60-question bank, domain-weighted to your chosen exam
- [ ] Mock 1, 2, 3 reports with per-domain scores and timing
- [ ] An error log with ≥ 15 entries, each with a written rule
- [ ] The final checklist completed
- [ ] A written go/no-go: ready, or which domain is still below threshold

---

## 5. Self-check

1. Cold: write the `stop_reason` table. How many of the six did you get?
2. Cold: write the `tool_choice` table. Which variant would you use to force one named tool?
3. You are at question 50 of 60 with 8 minutes left. What do you do?
4. A question offers a router, a hook, and a better tool description. Which wins?
5. What is the last thing you do before booking the exam? (Not "study harder.")

---

## 6. Cheat sheet

| Situation | Move |
| --- | --- |
| Question asks to enforce a rule | Programmatic for money/safety, prompt for style |
| Long answer truncated | Raise `max_tokens` or split the task — never retry unchanged |
| Subagent referenced "the findings" | That is wrong; findings must be passed explicitly |
| Justifying reduced human review | Segmented accuracy, never aggregate |
| Tool returns empty | Take no action |
| Tool times out | Retry with backoff |
| Config for "the whole team" | `<project>/.claude/…` |
| Offline bulk work | Batch API |
| Running out of time | Mark and move; never sit on one question |
| Multiple-response | Last sentence first; one certain, one certain-wrong, then decide |
| Below 72 % twice | Do not book — fix the weak domain first |
