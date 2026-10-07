# ADR-0069 — The Tool Permission and Risk Gate: one pre-execution decision for every tool call

- **Status:** Accepted
- **Decision id:** `DEC-AI-21-TOOL-PERMISSION-GATE`
- **Phase:** Tool Permissions & Risk Gate (AI Workplace)
- **Depends on:** ADR-0067 (the Tool Registry, whose invocation path the gate
  sits inside), ADR-0066 (the Agent Loop Engine that only ever reaches tools
  through that path), ADR-0065 (the Run Manager whose trace records the
  decision), ADR-0007 (deny-by-default authorization) and ADR-0057 (the human
  approval workflow the gate delegates to rather than re-implements).
- **Uses:** the existing permission system (`src/permissions/model.ts` —
  `checkPermission` over `PHASE1_PERMISSIONS`), consumed never duplicated.

## Context

ADR-0067 gave every tool call one gate sequence — identity, existence,
approval, permissions, input validation, execution, output validation — but
the permission and risk questions were answered inline, one check at a time,
with no single answer a caller or a trace could point at. The AI Workplace
needed a different thing: before anything executes, one explicit verdict over
_everything_ that decides a tool call — who the user is and what they hold,
whether the run itself is active, what the tool declares, how risky it is,
and whether a human approval exists — stated as a small, fixed set of
outcomes, deny-by-default whenever the information is not on file.

Three properties were non-negotiable. The agent must not be able to reach
execution without that verdict (a gate that can be walked around is not a
gate). The answer must land on the durable run record, so "why did (not) that
tool run?" is answerable from the Agent Run trace rather than from logs. And
the risk dimension had to be open: the roadmap's tool families (market data,
research, trading) carry different risks, and a future risk level must attach
without redesigning the Registry.

## Decision (`DEC-AI-21-TOOL-PERMISSION-GATE`)

A single **Tool Permission and Risk Gate** (`src/agent/tools/permissionGate.ts`)
answers every tool invocation with exactly one of three outcomes, evaluated
from five dimensions in order:

- **User permissions** — the server-resolved operation grants of the acting
  user (`userGrants`) are read against the required operation (default
  `tool.run`). No grant snapshot, or no `tool.run` in it, is a **BLOCK**.
- **Run permissions** — a tool executes only inside an active run
  (`running`, `responding`, `waiting-tool`, `validating`), with a known
  state. A missing or terminal run state is a **BLOCK**.
- **Tool permissions** — the tool must exist, declare at least one
  capability, and every declared capability must pass the existing
  deny-by-default rule table (`checkPermission` over `PHASE1_PERMISSIONS`,
  subject `model`).
- **Risk level** — evaluated against a risk policy table. A level with no
  entry is a **BLOCK** (deny by default); a new level attaches through the
  table (or the gate's `riskPolicy` option) alone — the Registry and the
  loop never change.
- **Approval requirement** — a tool that requires approval by contract, by
  side effects, or by its risk policy and has no current human approval is
  **REQUIRE_APPROVAL** — never a silent run.

**Outcomes are exactly three: `ALLOW`, `BLOCK`, `REQUIRE_APPROVAL`.** Missing
permission or risk information never defaults to ALLOW: the first blocking
check decides, and its reason is the decision's reason.

**The gate is un-bypassable by construction.** It is evaluated inside
`AgentToolRegistry.invoke()` — the one server-side execution path — before
input validation and before `execute` is ever called. The agent reaches tools
only through that path: descriptors returned by discovery are inert (no
`execute`), the loop builds every tool context itself from the run's own user
and correlation ids, and no surface exposes a direct execution entry point.
Permissions stay server-side and user/run scoped throughout.

**The decision lands in the run trace.** The full evaluation — decision,
reason, every check's verdict and reason, risk level, and whether the tool is
read-only or side-effecting — rides on the settled outcome, and the Run
Manager writes it onto `AgentRunRecord.toolRuns[].gate` through the existing
`recordToolRun` path, ownership-checked like every other run mutation.

## Consequences

- One question, one place, one recorded answer: any tool call the loop makes
  has a gate decision with its reason on the durable run record the
  Workplace already reads.
- Deny-by-default is now structural rather than incidental: unknown user
  grants, unknown run state, an unknown risk level or an unknown tool all
  land on BLOCK with a reason naming what was missing.
- Read-only and side-effecting tools stay distinguishable in every
  evaluation (`access`), so a future policy can treat them differently
  without touching a contract.
- There is still exactly one permission system: the gate consumes
  `checkPermission`/`PHASE1_PERMISSIONS` and the existing approval workflow;
  it adds a decision layer, never a second source of truth.
- Out of scope, unchanged: trading actions and external side effects, RAG,
  evaluation, learning, approval UI, and mock responses — the gate decides,
  it does not approve on a human's behalf, and nothing executes outside the
  Registry.
