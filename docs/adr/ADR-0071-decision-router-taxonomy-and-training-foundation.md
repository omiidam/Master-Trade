# ADR-0071 — Decision Router foundation: Needle 3's taxonomy, schemas and training data

- **Status:** Accepted
- **Decision id:** `DEC-AI-23-DECISION-ROUTER`
- **Phase:** Decision Router Taxonomy & Training Foundation (AI Workplace)
- **Depends on:** ADR-0059 (the training foundation: dataset provenance,
  the no-live-data rule and the validation gate every dataset passes),
  ADR-0058 (the seam discipline — a phase implements a contract and does
  not grow a runtime), ADR-0067 (the Tool Registry a `TOOL_REQUIRED`
  route ultimately reaches) and ADR-0069 (the permission gate that
  remains the only way a tool ever runs).
- **Uses:** the existing dataset provenance vocabulary
  (`src/training/foundation.ts`), consumed never duplicated; `zod` for
  strict schemas, as elsewhere in the project.

## Context

Every turn today reaches the LLM Gateway: a greeting costs what a
market-structure analysis costs, and nothing in between decides whether
cloud reasoning is needed at all. The roadmap's answer is **Needle 3** —
a small local model that classifies the request and picks a route
_before_ any expensive call.

Two constraints shape what this phase may be. First, Needle 3's role is
bounded: it is not the main reasoning model, it does not replace
DeepSeek or the cloud gateway, and it never answers the user — it
decides, and a separate layer acts on the decision. Second, a
fine-tuned classifier is only as honest as the labels it learned from,
so the taxonomy, the output contract and the training data have to exist
and be machine-checked _before_ any fine-tuning runs — a label invented
during training is a route invented during production.

Phase 2.12-A is therefore foundation only: taxonomy, schemas, a curated
dataset skeleton and documentation. No model is trained, nothing is
wired into the request path, and the Agent Loop, LLM Gateway and
response pipeline are untouched.

## Decision (`DEC-AI-23-DECISION-ROUTER`)

`src/training/decisionRouter.ts` (exported through
`src/training/index.js`) defines the complete contract, and
`training-data/decision-router.jsonl` holds the first curated dataset.

### 1. Intent classification — eight closed intents

`NON_TRADING` (greetings, casual conversation, unrelated questions),
`TRADING_EDUCATION` (concepts, definitions, basic explanations),
`MARKET_ANALYSIS` (technical analysis, price action, order flow,
liquidity, market structure), `PORTFOLIO_ANALYSIS` (allocation,
portfolio decisions, risk exposure), `RISK_MANAGEMENT` (position sizing,
risk rules, drawdown questions), `TRADE_JOURNAL` (reviewing previous
trades, performance analysis), `MARKET_DATA_REQUEST` (price data,
external information, real-time data) and `SYSTEM_REQUEST` (AI Workplace
configuration, settings, account actions).

The list is closed by enumeration and each intent carries its
subcategories and a one-sentence meaning, so a label is never guessed
and a classifier cannot mint a ninth intent.

### 2. Routing decisions — five closed routes

`LOCAL_RESPONSE` (handled without a cloud LLM), `MEMORY_RETRIEVAL`
(retrieve existing knowledge/context), `TOOL_REQUIRED` (requires
approved tool execution), `LLM_GATEWAY` (requires DeepSeek/cloud
reasoning) and `BLOCK` (rejected by policy). Each route has a documented
meaning and implies exactly two flags (`ROUTE_FLAGS`): only
`LLM_GATEWAY` sets `requires_llm`, only `TOOL_REQUIRED` sets
`requires_tool`.

Per-intent guidance (`INTENT_ALLOWED_ROUTES`) records which constructive
routes are expected for each intent — greetings stay local, education
draws on retrieval (or the gateway for deeper explanations), market
analysis goes to the gateway, data requests need tools, system settings
are local. `BLOCK` is legal under every intent: policy can reject any
request, whatever it classifies as.

### 3. Decision output schema — strict, machine-consumption-only

```json
{
  "intent": "",
  "route": "",
  "confidence": 0,
  "reason": "",
  "requires_llm": false,
  "requires_tool": false
}
```

A `zod` strict object: unknown keys are refused (a model that invents a
field did not follow the contract), `confidence` is an integer 0–100,
`reason` is bounded to 200 characters so it can never smuggle prose, and
the flags are refined to equal `ROUTE_FLAGS[route]` — they state the
route mechanically, never contradict it. There is **no field for a
user-facing reply anywhere in the schema**: the router decides the
route, and only the route. `parseRouterDecision` returns issues instead
of throwing, so a malformed model output is a refusal, never a crash.

### 4. Training dataset foundation

`training-data/decision-router.jsonl` — one JSON object per line, in
exactly the specified shape: `instruction` (the fixed string
`Classify this user request`), `input` (the user message) and `output`
carrying `intent`, `route` and `requires_llm` and nothing else. The
initial 30 hand-authored examples (origin `authored`, per the ADR-0059
provenance rules — never captured conversations) cover all eight
intents, all five routes and the eight promised categories: greetings,
irrelevant questions, basic trading education, advanced trading
analysis, market data requests, portfolio questions, risk questions and
tool requests — plus `BLOCK` examples for trade-execution and
permission-bypass requests.

`parseDecisionRouterJsonl()` validates any such text as a pure
function: line-numbered issues for malformed JSON, schema violations
(including invented keys), duplicate inputs, a `requires_llm` flag that
disagrees with the route, and a route the taxonomy does not allow for
the intent. `tests/decision-router.test.ts` runs it against the
committed file and additionally asserts coverage, field-exactness, and
the safety properties below.

### 5. Safety rules, by construction

The router must: never provide trading advice itself; never execute
trades; never bypass permission systems; never call external tools
directly; only decide the correct route. These are carried as data
(`DECISION_ROUTER_SAFETY_RULES`) and enforced structurally: a closed
six-key schema with no answer field, five routes that are labels rather
than actions, and a `TOOL_REQUIRED` route that means _"this needs the
Tool Registry and its permission gate"_ — a decision to require, never
an ability to do. Nothing in the module imports the Agent Loop, the LLM
Gateway, the response pipeline or any provider.

## Consequences

- Phase 2.12-B fine-tunes against a contract instead of an idea: closed
  vocabularies, a strict output schema, coherence rules and a validated
  dataset are all testable before a single LoRA weight moves.
- The dataset grows by appending validated lines; an incoherent or
  misrouted record fails the same validator the tests run, so label
  drift is caught at the file, not in production routing.
- Cost routing becomes _possible_ without changing anything yet: the
  gateway, the loop and the response pipeline behave exactly as before,
  and no request is classified at runtime until a later phase wires the
  (then-validated) model in.
- Trade-execution and permission-bypass requests are labelled `BLOCK`
  from the first example, so the classifier's earliest training data
  already treats them as refusals rather than tool work.
- Out of scope, unchanged: Needle 3 training itself (Phase 2.12-B),
  runtime routing, any change to the Agent Loop, LLM Gateway or
  response pipeline; no fake AI responses and no mock trading logic —
  the dataset stores classification labels, never answers.
