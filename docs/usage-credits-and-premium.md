# Usage credits, plans and premium — the foundation

Phase 5.4. What exists, what it enforces, what it deliberately does not do, and what a payment
integration would have to add.

**Status:** the accounting, the entitlement resolution, the API and the frontend are
**implemented and tested**. Payment is **not implemented** and no plan is **purchasable**. No
price is displayed anywhere, because none can be charged.

- Decision record: [ADR-0045](./adr/ADR-0045-plans-are-code-and-entitlement-only-narrows.md)
- The gate that decides whether an analysis may run at all:
  [input-quality-and-data-reliability.md](./input-quality-and-data-reliability.md)
- The planned module this one belongs to: §3.5 of
  [product-vision-system-architecture.md](./product-vision-system-architecture.md)

---

## 1. The two questions, kept apart

A credit system answers two questions that are easy to conflate and expensive to merge:

| Question                                  | Where it is answered                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| **May this account use this capability?** | `resolveEntitlement` — pure, deterministic, no clock, no store, no provider |
| **Has anything been spent for it?**       | the ledger — append-only, one row per movement, transactionally guarded     |

The first is an **authorization** decision and composes with the role table. The second is
**accounting**. Keeping them apart is why a refusal can be explained exactly ("this is not in
your plan" versus "the balance does not cover it") and why the number a user sees is a number
that was stored rather than computed.

```
plan (code) ──┐
subscription ─┼─▶ resolveEntitlement ──▶ allowance / refusal ──▶ reserve ──▶ settle | release
role table ───┤        (pure)                     │                  │            │
readiness gate┘                                  │            the ledger (SQL)    │
                                                 ▼                               ▼
                                        refusal is the reply            refund is a movement
```

## 2. Plans are code

`packages/shared/src/usage/plans.ts` holds the catalogue as constants. **A plan is not a row.**
An entitlement composed with the role table decides what a request may consume, so it is part
of the authorization boundary: a writable table would make that boundary mutable by a database
write, while a constant is reviewable, testable and revertible by a deploy. What _is_ stored is
which plan an account is on, because that is a fact about a user rather than a rule about the
product.

| Plan      | Allowance   | Renewal | Included                                                                   |
| --------- | ----------- | ------- | -------------------------------------------------------------------------- |
| `free`    | 20 credits  | daily   | `agent.chat` (20/period), `quality.assess` (free)                          |
| `premium` | 200 credits | daily   | the above, plus `portfolio.analysis`, `research.report`, `dataset.process` |

Three properties the catalogue itself is checked for, at boot and in tests:

1. **Nothing is purchasable.** `purchasable: false` and `price: null` for every plan, and
   `assertPlanCatalogue` refuses a catalogue in which that stops being true. A plan that
   acquired a price would be a way to take money for something nothing in this repository can
   charge for.
2. **No tier reaches an approval-gated operation.** The check runs against the real operation
   table, not a copy of it: a plan that included `backtest.run` (whose operation requires a
   recorded human approval) is refused, because a tier that could reach it would be a way to
   buy past a human decision. No shipped plan includes it.
3. **Every cost has a stated basis.** `assertFeatureCatalogue` refuses a non-integer,
   negative, or basis-less cost. A cost with no stated basis is a number nobody can review,
   and a review is the only thing standing between a credit system and a random price list.

`assertPlanCatalogue()` runs in `assertServerPreconditions`, so a catalogue that broke either
rule is a boot failure rather than a runtime surprise.

## 3. Costs, and what they mean

Credits are **integers**. A fractional credit would make a balance unable to be reconciled
exactly, so it is refused rather than rounded. One credit is roughly one free agent turn, and
the number is chosen to be readable rather than derived from a margin.

| Capability           | State       | Cost | Basis                                                                 |
| -------------------- | ----------- | ---- | --------------------------------------------------------------------- |
| `agent.chat`         | available   | 1    | Per turn, whatever the turn costs us in tokens                        |
| `quality.assess`     | available   | 0    | Runs no provider: a capability must not stop working when credits do  |
| `portfolio.analysis` | coming-soon | 5    | Enumerated, correlated and re-run per declared scenario               |
| `research.report`    | coming-soon | 10   | The longest generated artefact, and the one most likely to be re-run  |
| `backtest.run`       | coming-soon | 25   | Minutes of worker time plus a bar series                              |
| `dataset.process`    | coming-soon | 5    | A bounded normalisation job, priced like a portfolio analysis         |
| `memory.export`      | disabled    | 0    | Held for the data-protection review; export is never gated on credits |

Token spend is accounted separately in USD by the LLM gateway from the project's own price
table. It is deliberately **not** what the user pays here: a per-token price would make a single
answer's cost unpredictable to the person paying for it.

## 4. The credit ledger

`credit_ledger` is **append-only**. There is no update and no delete for a movement; a
correction is another movement. Every row carries:

| Field                                | Meaning                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `operation_id`                       | **Derived**: `grant:<period>`, `expire:<period>`, `refund:<op>`, or the caller's own key |
| `kind`                               | `grant` · `consume` · `refund` · `expire` · `adjustment`                                 |
| `status`                             | `reserved` · `settled` · `released`                                                      |
| `reason`                             | a closed code — free text lives in the audit record, not here                            |
| `delta`                              | signed, and the sign is decided by the kind, in one function                             |
| `balance_after`                      | the balance this movement produced, so history reconciles without replaying              |
| `feature`, `correlation_id`, `actor` | what it paid for, which request caused it, who caused it                                 |

Four rules, each enforced in one place:

1. **A balance is never negative.** `applyDelta` refuses it in the shared model, and the
   repository's single guarded statement carries `WHERE user_id = ? AND balance + ? >= 0`, so
   the check and the write are one operation rather than a read, a decision and a write.
2. **Idempotency is a unique index, not a lookup.** `UNIQUE (user_id, operation_id)` is claimed
   _before_ the debit, inside the transaction. A retry loses the claim, applies nothing, and
   reads back what the first attempt did.
3. **A refusal leaves nothing behind.** When a debit would cross zero the transaction rolls
   back, so the claim disappears with it and the same key can succeed later once the account is
   funded. The refused attempt is recorded in `usage_events` instead, which is where a
   non-movement belongs.
4. **Every movement is bounded.** `MAX_MOVEMENT` per operation and `MAX_BALANCE` per account:
   hard cost control means a runaway loop cannot inflate an account, and a bound is the only
   thing that stops it.

## 5. The metering lifecycle

```
                  ┌──────────── refused ───▶ usage_events(status=refused), nothing moves
request ─▶ gate ──┤
                  └──── allowed ─▶ reserve ──▶ work ──┬── completed, chargeable ─▶ settle
                                                        ├── completed nothing ─────▶ release
                                                        └── threw ─────────────────▶ release + rethrow
```

- **Reserve before the work.** The credit is claimed before the capability runs, so a
  concurrent request cannot spend the same credit: the claim is the ledger's unique operation
  id and the arithmetic happens in one guarded statement.
- **Settle what completed, return what did not.** A failed, blocked or refused operation costs
  nothing, and that fact is recorded as its own movement rather than as an absence.
- **Never charge for a rejection.** A refusal before execution — by the role table, by the plan,
  by the per-period cap or by the balance — writes a metering row and moves nothing.
- **`meter()` is the method to reach for.** It exists so the release-on-failure rule does not
  depend on a handler remembering it: the work is passed in, and anything other than a
  completed, chargeable outcome releases the reservation before the result — or the error —
  leaves the service.

A **released** debit and its **refund** are excluded from the period totals together, so a
failure reads as "this never cost anything" rather than as a spend plus income. That pair is
what makes the claim checkable.

**Metering is never silently unmetered.** A server with no database handle meters through an
in-process store — the capability is still metered, it simply cannot promise the balance
survives a restart, and `GET /v1/health/ready` says which store answered.

## 6. Periods and the reset policy

A period is a **UTC boundary computed from the clock**, never stored as a description of
"today": the key is derived, so two processes on the same instant agree about which period they
are in.

On the first metered operation of a new period the previous allowance **expires** and the new
one is **granted** — in that order, and the grant is guarded by its own operation id rather than
by the account's period key. That distinction is the difference between an idempotency key and a
flag: a process that dies between the two steps is repaired by the next call instead of leaving
the account at zero for the rest of the period.

**Unused credits expire.** A free allowance is a budget for a day, not a balance that
accumulates into a hoard that makes the allowance meaningless. Credits that must never expire
are a purchase, and purchases do not exist in this build.

Reading the balance **and** reading the history both bring the period in, deliberately: a
surface that showed 20 credits on one tab and an empty ledger on the next would be two views of
one account disagreeing about what happened.

## 7. Idempotency, plainly

| Situation                                                | What happens                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| The client retries a turn with the same `idempotencyKey` | The first attempt is reused; nothing is charged again; `usage.replay` is true |
| The client retries without a key                         | It is a **new attempt** — this request's own correlation id is its identity   |
| A reconnect re-sends the same key                        | Same as the first row: the ledger's unique index is the guard                 |
| The same administrative reference twice                  | One adjustment: the reference _is_ the operation id                           |
| The work fails after the reservation                     | The reservation is released in full, and the pair of rows says so             |

## 8. Entitlement enforcement, and who may not override it

`resolveEntitlement` takes the plan, the subscription status, the feature, the **role table's
answer** and the balance, and returns a decision. Precedence is stated rather than implied,
because each ordering is a product decision:

1. **an undeclared capability** denies (there are no rules to apply);
2. **a deliberate hold** (`disabled`) outranks everything, and is never offered as an upgrade;
3. **an unreadable plan** denies rather than falling back to a default;
4. **an inactive subscription** means the entitlements do not apply;
5. **not in the plan** — where an upgrade genuinely helps;
6. **a denied permission** is final, and is never reported as something an upgrade would fix:
   a plan never grants an operation the role table denies, and there is no branch that reverses
   it;
7. **an unbuilt capability** is a delivery gap, not a billing problem;
8. **the per-period cap** — separate from the balance, because a cheap capability is capped by
   invocations and an expensive one by credits;
9. **the balance** last.

The LLM is nowhere near this. It has no tool that reaches the ledger, no ability to resolve an
entitlement, and no path to the metering service: `usage.adjust` is an approval-gated operation
held by the account owner, and the route takes its actor from the principal. A model that could
decide what is affordable would be a model that could spend money.

**Frontend restrictions are not authorization.** The UI renders the server's decisions and
offers no control the server does not honour; every route is checked by the pipeline regardless
of what the client believes.

## 9. Security

- **Deny-by-default.** `usage.read` is granted by role (`observer` and `student` hold it,
  `system` does not); `usage.adjust` is the owner's alone and is **approval-gated**, so the
  request is refused with `451 POLICY_VIOLATION` without a recorded human approval.
- **The subject is the principal.** Neither read route accepts a user id, in the path or the
  body, so reading another account's balance is unrepresentable rather than merely forbidden.
  The administrative route takes one on purpose, and that is the whole of its purpose.
- **An operator may not act on their own account.** A credit grant is a spend authorization, and
  authorizing it for yourself is exactly what the approval gate exists to prevent — so the
  service refuses it, as the second of two checks.
- **A reference is required** for any administrative change, and it is a required field of the
  route's schema. It goes to the audit record, which has its own rules, never to a log line.
- **Logs carry no balances and no references.** The records say _whether_ something was charged,
  which plan, which denial — never how much is left.
- **The ledger is the accounting record and holds only movements; the metering log holds
  attempts.** Two tables because one table would need a status that means two things, and
  because a refused attempt must be allowed to succeed later with the same key.

## 10. The frontend surface

One navigation entry, `Usage`, with four internal tabs — overview, capabilities, plans, history.
Twelve components under `web/src/components/usage/`, and the rule they all keep: **they render
the server's numbers and compute none of their own.**

What the surface refuses to do, each because doing it would mislead:

- it does not total what you "could" still buy — credits are not a currency with a price;
- it does not hide a refusal: what you cannot use is listed beside what you can;
- it does not merge a delivery gap with an upgrade;
- it does not show a price or a purchase control;
- it does not show a stand-in for a balance. With no session or no store, it says so with the
  resolver's own reason. A plausible-looking number on this page would be a false statement
  about the user's own account.

## 11. Future payment integration — what it would have to add

Nothing here is a stub for payment, and that is deliberate. When a real integration is added, it
must arrive with:

1. **A price on the plan** and `purchasable: true` for exactly the plans that can be bought —
   which means relaxing the catalogue invariant deliberately, in a review, not by editing a row.
2. **Signed webhook handling** as its own verified source of truth: a subscription status must be
   written by the same actor rule that exists now (`changed_by` is mandatory), and the webhook —
   not the browser — is what makes a plan active.
3. **Credits that do not expire** for anything bought, which means a second expiry policy per
   ledger row rather than a change to the period rule.
4. **Refund and chargeback paths** as ledger movements, never as deletions.
5. **No card data in this repository.** A payment credential is the processor's to hold; the
   platform must not grow a field for one.
6. **A legal and tax review** of what is being sold, which is outside this codebase.

## 12. Deferred, with the trigger to revisit

| Item                                                                     | Trigger to revisit                                                                                             |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Deferred** — no payment integration                                    | A decision to sell a plan; every item in §11 must be in place first                                            |
| **Deferred** — no purchase or top-up of credits                          | As above; bought credits need a non-expiring policy, which is a schema change                                  |
| **Deferred** — no persisted quality or entitlement audit                 | A requirement to reconstruct "what was this account entitled to on that date" without replaying the ledger     |
| **Deferred** — no rate limiting on the metering path                     | A deployment exposed beyond loopback; the balance bounds spend, but not request volume                         |
| **Deferred** — no cost reconciliation between credits and provider spend | Wiring a hosted provider, when there is token spend to reconcile against the project price table               |
| **Deferred** — `memory.export` disabled                                  | The data-protection review (ADR-0042): export and hard-delete land together                                    |
| **Rejected** — a numeric "quality" or "value" score for credits          | Not deferred: a single number cannot say which refusal applied, and a threshold in a constant is a hidden rule |

## 13. Tests

| Suite                          | What it pins                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/usage.test.ts`          | Catalogue invariants, credit arithmetic, period derivation and turnover, summary cancellation, entitlement precedence                       |
| `tests/usage-api.test.ts`      | The lifecycle end to end over the real server, idempotency, concurrency, durability across a restart, isolation, admin acts, the agent turn |
| `tests/frontend-usage.test.ts` | The twelve components, the in-page tabs, the contract vocabulary, the server-owned numbers, the absence of a purchase control               |
| `tests/database.test.ts`       | That two concurrent transactions cannot interleave on the one connection (§14)                                                              |

## 14. One defect this phase found and fixed

Two concurrent metered turns against SQLite failed with
`cannot start a transaction within a transaction`. The driver is synchronous but the port is
not, so a transaction yields at its `await`s and a second request's continuation could open its
own transaction on the same connection. The fix is in the executor, not in the credit code:
`SqliteExecutor.transaction` now **serialises** — one transaction at a time on the one
connection. Serialising is the truth about a single-connection engine rather than a limitation
being papered over; a second connection would move the problem into `SQLITE_BUSY` retries
without making the arithmetic any safer. The regression is pinned in `tests/database.test.ts`.
