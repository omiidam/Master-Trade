# ADR-0009 — Deterministic tools own risk math; the LLM never bypasses permissions

**Status:** Accepted · **Date:** 2026-09-19 (Phase 1 invariant, reaffirmed in Phase 2)

## Context

Position sizing and R-multiple math decide how much money a learner risks. An LLM
can produce a confident, wrong number; a single bad number in a risk lesson is
worse than no answer. Phase 1 established the rule; Phase 2 adds an LLM gateway,
which is exactly where the rule could be quietly broken.

## Decision

All risk-relevant numbers come from deterministic, side-effect-free tools
(`src/tools/`). The model may explain them, request them and label them — never
compute or execute them. The AI layer keeps this structural:

- `ToolRegistry.register()` throws for any tool declaring side effects;
- `LlmRequest` cannot express execution, and `LlmGateway` holds no registry;
- the orchestrator performs the permission check and the tool run, records
  provenance, and returns `BLOCKED` with a reason when denied;
- `ai.allowModelDirectToolExecution` is typed `false` and startup-validated.

## Consequences

- Answers are reproducible: identical inputs and seed produce identical numbers.
- Failures are values (`ToolResult`) with explicit error strings, not exceptions,
  so a bad input produces an explanation rather than a crash.
- The epistemic contract is enforceable: tool outputs are `fact`; model text is
  `analysis | hypothesis | uncertainty`.
- Cost: the model cannot answer a numeric question in one step; it must request a
  tool, which adds latency and requires the tool to exist for each supported
  calculation.
- Regression protection: tests assert that a model referencing a denied
  capability is blocked, that an execution request is refused, and that no
  side-effecting tool can register.
