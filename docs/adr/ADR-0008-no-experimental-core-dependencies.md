# ADR-0008 — No experimental languages/technologies as core dependencies

**Status:** Accepted · **Date:** 2026-09-19

## Context

The project brief names Menai, Agen, Vercel Zero and AXON as interesting
directions while also requiring a stable, testable, TypeScript-based core and no
unrelated features. Mixing unproven runtimes into the foundation would conflict
with reproducibility and with a 6-month training roadmap.

## Decision

Keep the core in **TypeScript on Node ≥20** with an existing-tool stack
(TypeScript, Vitest, Prettier). Do not install Menai, Agen, Vercel Zero or AXON.
Adopt their _concepts_ where they add value, expressed in plain typed TypeScript.

## Consequences

- Menai (pure deterministic compute): reserved for future indicator/backtest
  kernels; the Rust host of the desktop shell is a plausible later home.
- Agen (state-driven orchestration): currently expressed as the typed lifecycle
  plus orchestrator inputs/outputs (`src/agent/lifecycle.ts`); revisit only with
  a documented need.
- Vercel Zero (capabilities/diagnostics): influenced the capability allow-list
  thinking in the desktop host and the explicit capability checks in the agent.
- AXON (auditability/provenance): influenced provenance, trust levels, correlation
  ids and the append-only audit design (`src/core/provenance.ts`,
  `docs/observability.md`).
- Cost: any future adoption requires a new ADR demonstrating a concrete gap the
  current stack cannot close.
