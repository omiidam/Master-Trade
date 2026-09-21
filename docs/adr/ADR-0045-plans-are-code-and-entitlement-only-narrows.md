# ADR-0045 — Plans are code, and entitlement may only narrow

- **Status:** Accepted (Phase 5.4)
- **Decision id:** `DEC-USAGE-1-PLANS-ARE-CODE`
- **Date:** 2026-09-21
- **Supersedes:** nothing
- **Related:** ADR-0007 (deny-by-default operations), ADR-0041 (input quality gates the output),
  ADR-0044 (the gate runs before the model)

## Context

Phase 5.1 placed **Usage Credits & Premium** in the roadmap as an independent, extensible
module, with a stated constraint: the platform must not encourage excessive or irresponsible
trading, consumption must be predictable and auditable, and payment integration is explicitly
_not_ part of this phase.

Three forces met when the module was built:

1. **Entitlement is authorization-adjacent.** Whether an account may consume a capability is
   the same kind of question as whether it may call an operation, and ADR-0007 answered that one
   with a closed operation table checked by role, deny-by-default. If a plan could widen what a
   role denies, there would be two permission systems and the weaker one would set the bound.
2. **Money is not in scope, but the shape of it is.** Something must carry "what does this cost"
   and "may this be bought" _now_, honestly, or the surface will invent it later.
3. **A balance is a number a user will act on.** It must be reconcilable exactly, never negative,
   never double-charged by a retry, and never charged for work that did not happen.

## Decision

### 1. Plans are declared in code, not stored in a table

`packages/shared/src/usage/plans.ts` is a constant catalogue. What is _stored_ is which plan an
account is on (`subscriptions`), because that is a fact about a user rather than a rule about the
product.

An entitlement composed with the role table decides what a request may consume, so it is part of
the authorization boundary. A writable table would make that boundary mutable by a database
write; a constant is reviewable, tested and revertible by a deploy.

**Consequence, stated plainly:** changing an allowance is a code change plus a deploy. The
trigger for revisiting this is the first allowance that must vary per account — a bespoke
enterprise contract, or a promotional grant — at which point the _grant_ becomes data and the
_catalogue_ stays code.

### 2. No plan is purchasable, and the catalogue refuses one that is

Every plan declares `purchasable: false` and `price: null`, and `assertPlanCatalogue()` refuses a
catalogue in which that stops being true. There is no payment integration, so no price can be
charged and none is displayed as if it could be.

`assertPlanCatalogue()` runs in `assertServerPreconditions`, so the invariant is a boot failure
rather than a review note. **An invariant nothing calls is documentation**, which is how the
next clause was found: the catalogue as first written included an approval-gated capability, and
nothing had ever executed the check that forbids it.

### 3. A tier may never reach an approval-gated operation

The check runs against the **real operation table**, not a copy of it: a plan including a feature
whose operation is `sensitivity: critical` or `requiresApproval` is refused, because a tier that
could reach one would be a way to buy past a human decision. No shipped plan includes
`backtest.run` for exactly this reason — it is a human decision, not a feature.

### 4. Entitlement may only narrow, never widen

`resolveEntitlement` takes the role table's answer as an **input** and has no branch that
reverses it. Precedence is fixed and documented: undeclared → hold → unreadable plan → inactive
subscription → not in plan → **denied permission (final)** → unbuilt → per-period cap → balance.

A refusal's meaning ships with the decision, and `upgradeIsHonest` decides whether an upgrade
may be _offered_ at all — so a held capability, a role refusal or a backlog item can never be
presented as something to buy.

### 5. Reserve before the work; return in full when it does not complete

The credits for a turn are claimed **before** the capability runs, in one guarded statement, and
the claim's identity is the ledger's unique `(user_id, operation_id)`. A retry loses the claim,
applies nothing, and reads back the first result. A release is a **pair** of rows — the debit
moved to `released` and a refund beside it — excluded from the period totals together, so
"this never cost anything" is checkable rather than asserted.

Charging at settlement instead would let two concurrent requests both pass an affordability check
against the same balance. That is the reason for the order, and it is not negotiable for an
optimization.

### 6. The arithmetic lives in one pure module

`packages/shared/src/usage/credits.ts` owns integer-only amounts, the sign rule per kind, the
non-negative rule, the ceilings, the period derivation and the turnover decision. The service
decides _whether_ to attempt a movement; it never computes a new balance. Both stores — SQL and
in-process — refuse the same movements for the same reasons, because both call the same
functions.

### 7. Unused allowance expires; bought credits would not

A free allowance is a budget for a day, not a balance that accumulates. This is why the reset
policy is `expire` and why the period turnover is derived from the clock rather than scheduled:
there is no window in which an account holds a stale allowance, and nothing to run when the
application has not been opened.

Bought credits must not expire. That is a **second policy per ledger row**, and it is the reason
§11 of the layer document lists it as a prerequisite of selling anything rather than a detail of
it.

## Consequences

**Good.** The cost of a capability is reviewable in one place. A refusal is explainable in the
contract's own words. A retry cannot double-charge. A failure cannot cost anything. The
guarantee that a model cannot spend money is structural — there is no operation for it and no
tool that reaches the ledger. The frontend cannot fabricate a balance, because there is nowhere
in it that computes one.

**Costly, and accepted.** Changing an allowance needs a deploy. A bespoke commercial deal has no
representation yet. Reading usage performs the period's own write (derived, idempotent, once),
which is a side effect on a `GET` — chosen because the alternative is two views of one account
disagreeing about what happened.

**Risks this creates.** A single-connection SQLite deployment serialises transactions; the
concurrency defect this phase found (§14 of the layer document) is fixed in the executor, but the
queue is per-process, so a future multi-process deployment needs a durable queue or a real
Postgres connection pool rather than this executor.

## Alternatives considered

- **Plans as rows, editable by an admin.** Rejected: it makes the authorization boundary
  writable, and requires a second review process to compensate for the one it removes.
- **Charging at settlement, with an affordability pre-check.** Rejected: two concurrent requests
  can both pass a check against the same balance.
- **A `usage_events` table doubling as the idempotency mechanism.** Rejected: idempotency exists
  to prevent a double _charge_, and a retry that was refused the first time must be allowed to
  succeed later with the same key. The ledger holds movements; the metering log holds attempts.
- **A numeric "value" score for what a capability is worth.** Rejected, not deferred: a single
  number cannot say which refusal applied, and a threshold in a constant is a hidden rule.
- **A payment stub.** Rejected: a stub is a claim the platform can take money, and the honest
  value is `purchasable: false` with the absence stated in the UI.

## Compliance

Enforced by `assertPlanCatalogue` (boot), `assertFeatureCatalogue` (boot), the guarded statement
in `UsageRepository.applyCredit`, the unique index on `(user_id, operation_id)`, the service's
refusal to let an operator act on their own account, the `usage.adjust` operation's
approval gate, and the suites listed in §13 of the layer document.
