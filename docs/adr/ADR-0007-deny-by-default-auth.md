# ADR-0007 — Deny-by-default authorization with human approval for sensitive operations

**Status:** Accepted · **Date:** 2026-09-19

## Context

The system teaches trading and will accumulate rules, memory and personal
learning data. Any permission model that allows by default will eventually grant
something nobody reviewed — and a single rule that can trade suffices to destroy
the safety property of the whole product.

## Decision

Adopt an explicit operation catalogue with deny-by-default role grants
(`src/auth/model.ts`), mark sensitive/critical operations as approval-gated, and
make a recorded human approval the only path to activate a rule
(`src/agent/approval.ts`, `src/agent/proposals.ts`).

## Consequences

- Adding a capability requires an explicit operation id, a role grant and a
  reviewable diff — no implicit power.
- Automation (model, jobs, tools) cannot self-authorize: model writes are
  unverified, approval-gated jobs cannot be enqueued unapproved, and a requester
  can never approve their own request.
- `assertNoHardlineOperations()` and `assertSafeConfig()` make the _absence_ of
  broker/live-trading capabilities a testable property, verified in CI.
- Cost: verbosity (an operation per action) and some friction for research
  workflows because approvals expire after 7 days.
- Approval fatigue is a known risk (R7); mitigations are evidence requirements,
  rationale fields and (future) a metrics side-by-side review UI.
