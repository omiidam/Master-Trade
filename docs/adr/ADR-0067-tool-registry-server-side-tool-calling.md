# ADR-0067 — A centralized Tool Registry: the one server-side execution path for agent tools

- **Status:** Accepted
- **Decision id:** `DEC-AI-19-TOOL-REGISTRY`
- **Phase:** Tool Registry & Tool Calling Foundation (AI Workplace)
- **Depends on:** ADR-0066 (the Agent Loop Engine, whose tool phase invokes
  through this registry), ADR-0057 (the human approval workflow this module
  delegates to rather than re-implements), ADR-0058 (request scoping —
  user/run isolation is structural here), and the existing deny-by-default
  permission system (`src/permissions/model.ts`), which the registry
  consumes and never duplicates.

## Context

The loop engine (ADR-0066) records tool requests and executes nothing: its
tool phase was a named seam waiting for an owner. What that owner must be
was already decided by the system's oldest rules — the permission model is
deny-by-default and explicit; side-effecting and critical operations require
a human approval that the requester can never grant themselves; and nothing
a user's run touches may leak across users or runs. A registry that
re-implemented any of those rules would be a second permission system, and
the codebase would drift the way codebases drift.

The contracts also had to be typed hard enough that a tool cannot lie: its
inputs and outputs must validate against its own declared schemas, its risk
must ladder honestly (a critical or side-effecting tool cannot declare
itself un-gated), and a trading tool can never register without a human
approval requirement.

## Decision (`DEC-AI-19-TOOL-REGISTRY`)

One centralized **Tool Registry** (`src/agent/tools/registry.ts`, contracts in
`src/agent/tools/contracts.ts`) is the single server-side execution path for agent
tools:

- **Typed contracts.** Every tool declares identity (name, semver),
  description, category (market data, portfolio, trading, research,
  retrieval, general — the families the roadmap names, none implemented
  here), a zod input schema and a zod output schema, capability classes from
  the existing permission model, a risk level, a per-call timeout, an
  approval requirement, and whether it side-effects.
- **One gate sequence per invocation**, each stage refusing without reaching
  the next: identity (a valid user/run context, malformed scope is a caller
  bug), existence, approval (delegated to the injected approval seam backed
  by the existing human approval workflow), permissions
  (`checkPermission` over `PHASE1_PERMISSIONS` — consumed, not copied),
  input validation, server-side execution under the tool's timeout, and
  output validation before anything returns to the loop.
- **Failures are values.** An invocation settles into one outcome —
  `succeeded`, `failed`, `timeout` or `refused` (with the gate that said
  no) — so a caller can feed the exact reason back to the model instead of
  aborting the run. Refusals never throw; a malformed isolation scope
  throws, because that is a programming error.
- **Isolation is structural.** Tools receive their scope explicitly —
  user id and run id, opaque attribution only — and a run with no user
  identity can never execute a tool. Records carry the same scope.
- **Loop integration without redesign.** The loop engine's tool phase
  invokes each requested tool through the registry and feeds the validated
  outcomes back as one fresh runtime context section. A serviced request
  ends the outstanding ask (the default decider completes when the latest
  summary requests nothing); a futile ask reproduces an identical input the
  repeated-step guard refuses before the gateway is paid again.
- **Basic status recording.** Every invocation leaves one bounded in-memory
  record — tool, version, user, run, status, error, duration, time. This is
  deliberately not a persistent tool history.

## Consequences

- Tool execution is server-side only and there is exactly one path to it;
  the harness, Run Manager, Context Builder, LLM Gateway and the existing
  permission and approval systems are consumed, none duplicated.
- The registry runs no tools itself until tools are registered: this phase
  ships the foundation, no trading action, no RAG/retrieval tool, no
  persistent history, no evaluation and no learning.
- Unapproved, unpermitted, malformed or misbehaving tool calls are visible,
  recorded refusals — never silent successes and never thrown runs.
