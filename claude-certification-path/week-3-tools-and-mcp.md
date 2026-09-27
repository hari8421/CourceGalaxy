---
title: "Week 3 — Tools & MCP"
track: "claude"
week: 3
order: 3
type: "module"
hours: 18
summary: "The full tool_use → tool_result cycle, tool schema design, structured error envelopes, and building a real MCP server in Python."
tags: ["tool-use", "mcp", "tool-schema", "structured-errors", "mcp-server", "fastmcp"]
---

# Week 3 — Tools & MCP

**Goal by Friday:** a working MCP server over a real data source whose tools return a
structured error envelope instead of a stack trace — plus the full `tool_use` →
`tool_result` loop implemented by hand in raw Python.

---

## 1. Concepts (2.5 h)

### 1.1 The complete tool cycle

```
you ──▶ tool_result(tool_use_id) ──▶ Claude
                                     │
       tool_use {id, name, input}  ◀─┘
```

```python
tools = [{
    "name": "get_order",
    "description": "Fetch a single customer order by its order id. Returns status, carrier and ETA.",
    "input_schema": {
        "type": "object",
        "properties": {
            "order_id": {"type": "string", "pattern": "^ORD-\\d{4}$",
                         "description": "Order identifier, e.g. ORD-4412"},
        },
        "required": ["order_id"],
    },
}]

messages = [{"role": "user", "content": "Where is order ORD-4412?"}]

# --- turn 1: the model asks for a tool ---
msg = client.messages.create(model=MODEL, max_tokens=1024, tools=tools, messages=messages)
assert msg.stop_reason == "tool_use"

tool_uses = [b for b in msg.content if b["type"] == "tool_use"]
messages.append({"role": "assistant", "content": msg.content})   # keep blocks verbatim

# --- you execute, and ALWAYS return a result ---
results = []
for call in tool_uses:
    try:
        payload = run_tool(call["name"], call["input"])
    except BusinessError as e:
        payload = {"error": str(e), "recoverable": True}         # the model must see this
    results.append({
        "type": "tool_result",
        "tool_use_id": call["id"],        # must match, or the API errors
        "content": json.dumps(payload),
        "is_error": bool(payload.get("error")),
    })

messages.append({"role": "user", "content": results})            # user role, always

# --- turn 2: the model answers with the tool output in context ---
final = client.messages.create(model=MODEL, max_tokens=1024, tools=tools, messages=messages)
```

**Five rules, each of which is an exam objective:**

1. **Tool results go back in a `user` message**, not an assistant one.
2. **Every `tool_use` needs a matching `tool_result`** with the same `tool_use_id`.
   Omitting one is a hard API error that kills the request.
3. **Append the assistant's `content` blocks verbatim** before the results — dropping the
   `tool_use` block loses the call from the conversation state.
4. **Multiple tool calls in one turn happen.** Loop over all of them; do not assume one.
5. **Tool errors are data, not exceptions.** A stack trace teaches the model nothing; a
   structured, actionable error lets it self-correct.

### 1.2 Tool schema design — the description *is* the documentation

The model has no other documentation for your tool. Compare:

```python
# Weak: the model guesses, or calls the wrong tool
{"name": "query", "description": "Query the database",
 "input_schema": {"type": "object", "properties": {"q": {"type": "string"}}}}

# Strong: the model can use it without further help
{"name": "search_orders",
 "description": "Search customer orders. Use when the user mentions an order, delivery, "
                "return or refund. Filter by any combination; omit filters to search all. "
                "Returns at most 20 orders, newest first. Does NOT return payment details.",
 "input_schema": {
    "type": "object",
    "properties": {
        "email":     {"type": "string", "description": "Customer email, if known"},
        "order_id":  {"type": "string", "pattern": "^ORD-\\d{4}$"},
        "status":    {"type": "string",
                      "enum": ["pending", "shipped", "delivered", "refunded"]},
        "limit":     {"type": "integer", "minimum": 1, "maximum": 20, "default": 20},
    },
    "required": [],                      # see below — this is a deliberate choice
 }}
```

Design rules, all exam-relevant:

- **Name the trigger, not just the action.** "Use when the user mentions an order" is the
  difference between right and wrong tool selection.
- **State what it does *not* do.** Negative scope prevents a confident wrong call.
- **Constrain the arguments**: `enum`, `pattern`, `minimum`/`maximum`, and clear
  `description` on every property. A JSON Schema is a validation tool, not decoration.
- **`required` should usually be short.** Requiring fields the model cannot know forces
  invention. Better: make them optional, and offer an explicit "unknown" where it matters.
- **Few, well-scoped tools beat many overlapping ones.** Two tools with similar descriptions
  produce coin-flip selection.
- **Read tools and write tools are separate.** Never put a side effect behind a name that
  sounds like a lookup.

### 1.3 The structured error envelope

If you build one thing this week, build this. The Anthropic MCP ecosystem expects tools to
return machine-actionable errors, and the exam's MCP scenarios assume you know the shape:

```json
{
  "isError": true,
  "errorCategory": "transient | validation | business | permission",
  "isRetryable": true,
  "description": "Order ORD-9999 was not found. Order ids are ORD- followed by 4 digits.",
  "attemptedOperation": "get_order(order_id='ORD-9999')",
  "partialResults": [],
  "alternativeApproaches": ["ask the user to confirm the order id from their confirmation email"]
}
```

Why each field earns its place:

| Field | What it buys |
| --- | --- |
| `errorCategory` | Lets the *caller* decide retry vs fix vs escalate without string matching |
| `isRetryable` | A model can autonomously retry a transient failure and escalate a permission one |
| `description` | Written for a human *and* a model to act on — name the format rule |
| `attemptedOperation` | Debuggability: you know exactly what was tried |
| `partialResults` | Lets the model continue with partial data instead of discarding work |
| `alternativeApproaches` | The single most useful field — it turns a dead end into a next step |

**Never return a Python traceback from a tool.** It contains internal paths, wastes
context, and gives the model no path forward.

### 1.4 MCP — what it is and when it earns its place

MCP (Model Context Protocol) standardises how a model reaches external systems. A **server**
exposes three primitives over JSON-RPC:

| Primitive | What it is | Use it for |
| --- | --- | --- |
| **Tools** | Model-invoked functions | Actions and queries the model decides to make |
| **Resources** | Application-controlled context | Files, schemas, docs the client chooses to attach |
| **Prompts** | User-controlled templates | Reusable, slash-invocable workflows |

**The decision that gets asked repeatedly:** *API integration or MCP?*

| Use the **API directly** when | Use **MCP** when |
| --- | --- |
| It is your own service, one consumer | Multiple clients must reuse the integration |
| You control the client and the tool schemas | You want the tools available in Claude Code, an IDE, other agents |
| The integration is 2–3 bespoke endpoints | The integration spans several systems |
| You need custom auth/transport semantics | You want it to work across model providers |

MCP is a **portability and reuse** play. For a single service with one caller, hand-written
tool definitions are less machinery. Saying *why* you chose is the examinable part.

### 1.5 Building the server

```python
# server.py
from mcp.server.fastmcp import FastMCP
import json

mcp = FastMCP("orders")


class ToolError(Exception):
    def __init__(self, category: str, description: str, retryable: bool = False,
                 alternatives: list[str] | None = None):
        super().__init__(description)
        self.envelope = {
            "isError": True,
            "errorCategory": category,          # transient | validation | business | permission
            "isRetryable": retryable,
            "description": description,
            "attemptedOperation": "",
            "partialResults": [],
            "alternativeApproaches": alternatives or [],
        }


@mcp.tool()
def get_order(order_id: str) -> dict:
    """Fetch a customer order by id. Returns status, carrier, ETA and line items.

    Use when the user mentions a specific order, delivery or refund.
    """
    if not order_id.startswith("ORD-"):
        raise ToolError(
            "validation",
            f"'{order_id}' is not a valid order id. Format is ORD- followed by 4 digits, e.g. ORD-4412.",
            alternatives=["ask the user for the id from their confirmation email"],
        )
    order = db.get(order_id)                    # may be None
    if order is None:
        raise ToolError(
            "business",
            f"No order {order_id} exists in this workspace.",
            alternatives=["search_orders(email=...) if the user's email is known"],
        )
    return order


@mcp.tool()
def refund_order(order_id: str, amount_cents: int, request_id: str) -> dict:
    """Issue a refund. Requires a unique request_id so retries cannot double-charge.

    Amounts over 50000 cents require human approval and will be queued, not executed.
    """
    if amount_cents > 50_000:
        return {"status": "queued_for_approval", "reason": "amount above auto-approval limit"}
    return payments.refund(order_id, amount_cents, idempotency_key=request_id)


if __name__ == "__main__":
    mcp.run()          # stdio transport; clients spawn this as a subprocess
```

Connecting a client:

```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

params = StdioServerParameters(command="python", args=["server.py"])

async with stdio_client(params) as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()
        tools = await session.list_tools()            # discover, do not hardcode
        result = await session.call_tool("get_order", {"order_id": "ORD-4412"})
```

**Client config for Claude Code** — note the scope difference, because the exam asks it:

```jsonc
// .mcp.json  — team, version-controlled, shared with the repo
{ "mcpServers": { "orders": { "command": "python", "args": ["server.py"] } } }

// ~/.claude.json — personal, machine-level, never shared
```

### 1.6 Claude Code configuration scope (memorise this split)

| Path | Scope | Version controlled? |
| --- | --- | --- |
| `~/.claude/CLAUDE.md` | **Personal**, all your projects | No |
| `<project>/CLAUDE.md` | **Team**, whole repo | **Yes** |
| `<project>/.claude/CLAUDE.md` | **Team**, repo-scoped config dir | **Yes** |
| `<project>/.claude/commands/*.md` | Team slash commands | **Yes** |
| `<project>/.claude/skills/<n>/SKILL.md` | Team skills | **Yes** |
| `<project>/.claude/rules/` | Path-scoped rules | **Yes** |
| `<project>/.mcp.json` | Team MCP servers | **Yes** |
| `~/.claude/commands/`, `~/.claude/skills/` | Personal | No |

**If a question says "the whole team should get this" → `<project>/.claude/…`. If it says
"just my machine" → `~/.claude/…`.** That one split resolves a large share of the
configuration questions.

---

## 2. Lab — MCP server + raw tool loop (the week's main build)

### 2.1 Build an order-tools MCP server

**Spec:**

- [ ] `search_orders(email, order_id, status, limit)` — read, paginated, `limit` capped
- [ ] `get_order(order_id)` — read, full detail
- [ ] `refund_order(order_id, amount_cents, request_id)` — **write**, idempotent, approval limit
- [ ] Every failure raises the structured envelope; no traceback ever escapes
- [ ] Docstrings written as *trigger* descriptions ("use when the user mentions…")
- [ ] `list_tools()` output reviewed as if it were the only documentation the model gets

### 2.2 The raw loop, no framework

```python
def run_agent(question: str, max_steps: int = 8) -> str:
    tools = list(mcp_tools_spec())             # the same schemas the MCP server exposes
    messages = [{"role": "user", "content": question}]
    seen: set[tuple] = set()

    for step in range(max_steps):              # step budget
        msg = client.messages.create(
            model=MODEL, max_tokens=2048, tools=tools, messages=messages
        )

        if msg.stop_reason != "tool_use":
            return text_of(msg)                # end_turn: we are done

        messages.append({"role": "assistant", "content": msg.content})

        results = []
        for call in (b for b in msg.content if b["type"] == "tool_use"):
            fingerprint = (call["name"], json.dumps(call["input"], sort_keys=True))
            if fingerprint in seen:            # loop detection
                results.append(tool_result(call["id"],
                                {"error": "duplicate call ignored", "isRetryable": False}))
                continue
            seen.add(fingerprint)
            results.append(tool_result(call["id"], execute(call)))
        messages.append({"role": "user", "content": results})   # never skip a result

    return "Step budget exhausted — escalate to a human."
```

Test it against adversarial input:

```python
cases = [
    ("Where is ORD-4412?",            ["get_order"],            ["shipped"]),
    ("Refund order ORD-4412 £600",   ["get_order","refund_order"], ["queued_for_approval"]),
    ("What's the capital of Peru?",   [],                       []),        # must NOT call tools
    ("99",                            ["get_order"],            []),        # invalid id -> error
]
```

The third case is the one people forget: **verify the agent does *not* use tools it does not
need.**

### 2.3 Evaluate like an exam

```python
def score(case, result) -> bool:
    used = {c["name"] for c in result.tool_calls}
    if not set(case.get("must_use", [])) <= used:      return False
    if set(case.get("must_not_use", [])) & used:       return False
    return all(k in result.text for k in case.get("must_contain", []))
```

---

## 3. Practical drills (2 h)

| # | Drill | Teaches |
| --- | --- | --- |
| 1 | Two tools with overlapping descriptions; measure selection accuracy | Descriptions are a specification |
| 2 | Return a raw traceback from a tool; observe model behaviour | Errors are data, and shape behaviour |
| 3 | Swap the error envelope for one with `alternativeApproaches` | One field, large recovery gain |
| 4 | Add a `request_id` and fire the same refund twice | Idempotency on write tools |
| 5 | Move a config file from `~/.claude/` to `<project>/.claude/` | The scope question, made concrete |
| 6 | Break the `tool_use_id` match and read the API error | Why step 2 of the cycle is mandatory |
| 7 | Have the model call two tools in one turn | Multiple parallel tool calls are normal |

---

## 4. Deliverable — MCP order server

- [ ] 3 tools (2 read, 1 write) with trigger-style descriptions and constrained schemas
- [ ] Structured error envelope on every failure path; no traceback escapes
- [ ] `alternativeApproaches` populated for business and validation errors
- [ ] Idempotency key + approval ceiling on the write tool
- [ ] Raw agent loop with step budget, loop detection, and always-answered tool results
- [ ] Eval of ≥ 20 cases including must-use **and** must-NOT-use tool assertions
- [ ] `.mcp.json` committed; `README.md` documenting the schemas as the model sees them

---

## 5. Self-check

1. Why must `tool_result` blocks be sent in a `user` message?
2. What happens if you omit a `tool_result` for one of two parallel tool calls?
3. When is `required: []` the right choice, and what is the risk?
4. Describe the structured error envelope from memory. Which field is most valuable, and why?
5. A tool times out. `errorCategory`, `isRetryable`, and the client's behaviour?
6. When would you choose a plain API integration over MCP? Give two conditions.

---

## 6. Cheat sheet

| Need | Mechanism |
| --- | --- |
| Model must use a tool | `tool_choice: {"type":"tool","name":…}` |
| Tool returns data | `tool_result` with matching `tool_use_id`, in a `user` message |
| Tool fails informatively | `isError` + `errorCategory` + `isRetryable` + `alternativeApproaches` |
| Recoverable failure | Model retries when `isRetryable`, escalates when not |
| Tool needs exact input | `enum` / `pattern` / `minimum` / `maximum` in `input_schema` |
| Correct tool chosen | Trigger language in the description, and negative scope |
| Share integration across clients | MCP server, registered in `.mcp.json` |
| Team-shared Claude config | `<project>/.claude/…` (version-controlled) |
| Personal Claude config | `~/.claude/…` (not shared) |
