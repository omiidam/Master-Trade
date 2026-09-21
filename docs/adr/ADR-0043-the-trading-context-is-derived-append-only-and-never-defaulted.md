# ADR-0043 — The trading context is derived, append-only and never defaulted

- **Status:** Accepted
- **Phase:** 5.2
- **Decision id:** `DEC-PROFILE-1-DERIVED-STATUS`

## Context

ADR-0041 §8 set a requirement rather than a design: _required inputs get a durable home_.
This phase builds that home for capital band, risk tolerance, horizon, holdings, constraints,
experience, markets, instruments, style, timeframe and learning goals. Everything ADR-0041
decided about how inputs are _used_ applies to the moment they are stored, and four of its
rules are impossible to honour after the fact:

- **"Confidence is the minimum, never the mean"** requires knowing, per field, whether it was
  stated, computed or assumed, and when it was observed. A store that keeps only the value
  cannot answer this later — the provenance is gone.
- **"Conflicts are surfaced, never resolved silently"** requires the contradictions to be
  detectable from stored data, which means the store has to hold values that can disagree
  rather than a normalized shape in which they can no longer be compared.
- **"The level is visible in the product"** requires the assessment to be recomputable against
  the freshness policy _in force_, so a status computed at write time under an older policy
  must not be the answer.
- **"Insufficient input descends the ladder"** requires the gaps to be recoverable — a store
  that fills a blank with a default has destroyed the question the ladder exists to ask.

There is also a versioning requirement arriving from the other direction. Phase 5.1 §3.3 makes
the _decision evaluator_ depend on knowing which context an answer was given from, so that a
recorded decision can be reviewed against the assumptions it actually rested on. A mutable
profile row cannot support that: after the first edit, the inputs behind an earlier answer are
unrecoverable.

Finally, the data is personal by nature — a declared risk tolerance, a described allocation, a
stated constraint. Three earlier phases' worth of controls (deny-by-default operations, one
owner per table, no subject parameter in a route) apply here with more force than usual,
because a leak is not a bug in a display, it is a disclosure.

## Decision

**A trading context is a versioned, append-only document of field-level declarations. Its
status is derived every time it is read; its value is never defaulted; its version is never
chosen by the caller.**

1. **One pure module owns the vocabulary and the rules.** `packages/shared/src/profile/model.ts`
   declares the enums, the field shape, the freshness policy, the contradiction rules, the
   assessment and the clarifying questions. No clock, no database, no network — so the rules
   that matter are unit-testable without a server, and both the API and the UI reach the _same_
   answer. Two implementations of "is this stale?" would eventually disagree, and the version a
   user sees would then be the wrong one.

2. **Every field is `{ value, source, observedAt, note? }`.** `source` is `user-stated`,
   `derived` or `assumed`. `value: null` is a legitimate state meaning _the user has not told
   us_, and is not an error and not something to fill.

3. **Status is derived, never stored.** `fieldStatus()` computes `missing` / `assumed` /
   `stale` / `confirmed` / `derived` from value, source and timestamp. A stored status is a
   second source of truth that drifts from the timestamps the moment one is updated without the
   other. Two consequences are deliberate:
   - a value with `source: 'assumed'` is **never** `confirmed`, even when fresh;
   - a `user-stated` value with **no** observation time is treated as `assumed`, not trusted —
     an undated claim cannot be assessed for recency, and assuming it is current is exactly the
     silent default this ADR forbids.

4. **Freshness belongs to the input kind, not to a global TTL.** Holdings age in 30 days,
   instruments in 90, markets and horizon in 365, and experience level, trading style, learning
   goals and constraints do not age at all. A single TTL would re-ask for things that do not
   change and keep trusting things that do.

5. **Confidence is the weakest required field.** `assessContext()` returns
   `weakest = min` over the required fields, plus `completionPercent` computed only over
   required fields, plus the named `gaps` (missing or assumed) and `stale` lists. The percentage
   is never reported alone: "60% complete" is not actionable, and the list of what is missing is.
   `holdings` and `constraints` are **not** required — declining to describe a portfolio must
   not mark a profile incomplete.

6. **Impossible contexts are refused; ambiguous ones are asked about.** Contradictions carry a
   severity. `reject` (an allocation summing above 100%, a duplicate holding, an intraday horizon
   on a weekly bar, an undated stated fact, an order-shaped constraint) fails validation and
   nothing is stored. `question` (scalping on a daily bar, a held instrument absent from the
   preferred list) is returned to the caller to surface as a prompt, never silently resolved. The
   distinction is ADR-0041 §4 and §5 encoded as data.

7. **A constraint is prose, so its refusal vocabulary must be prose-aware.** The existing
   `HARDLINE_OPERATION_PATTERN` and `HARDLINE_JOB_PATTERN` match _identifiers_
   (`place-order`, `live_trading`), so their separators are `[._-]`. The first version of
   `HARDLINE_CONSTRAINT_PATTERN` copied them, and `"Place order 100 shares when the price
drops"` therefore **passed** — an execution instruction stored in a field the Agent reads,
   which is precisely what the check exists to prevent. The separator class now includes
   whitespace. Same vocabulary, different input shape, and the input shape is what the pattern
   has to match.

8. **A version is append-only and its number is the server's.** `append()` derives
   `nextVersion` from the current row and stamps the document with it, so a client can neither
   choose, skip nor replay a version. There is no update and no delete. Two concurrent appends
   race on the unique `(user_id, version)` index and the loser gets a typed `CONFLICT` rather
   than a silent overwrite. Attribution is mandatory: `changedBy` may be empty neither for a
   user edit nor for a system edit.

9. **Ownership is one table, one owner, no subject parameter.** The table is
   `trading_context_versions`, owner `profile`; the handler routes are `profile.read` and
   `profile.write`, and the path is exactly `/v1/profile` with no parameters. There is no method
   that returns more than one user's context, so cross-user access is not merely forbidden — it
   is unrepresentable at the API boundary. An unset profile is **not** a 404: it is an
   all-null document plus the questions it implies, because the missing fields are the point.

10. **No store, no answer.** With no repository configured the handler refuses with
    `PROVIDER_UNAVAILABLE` naming the missing capability, rather than keeping an in-memory
    profile that would silently vanish on restart.

## Consequences

- **The evaluator gets a stable referent.** A recorded decision can name the context version it
  was given from, and that version still says what it said. This is the reason to store history
  now, before there is any history to store.
- **The store is small and boring.** One table, one JSON document column, identity and ordering
  columns for what SQL needs to constrain. A column per field would duplicate the model and make
  a half-written context representable.
- **The write path is not the enforcement point for questions.** `question` findings do not block
  a save, by design: the user may genuinely hold a scalping style on a daily bar. They come back
  in the response and the UI shows them. This means a client that discards the response body
  loses the questions — accepted, because the alternative (refusing a legitimate declaration) is
  worse.
- **The reader must not bypass the type codec.** The first implementation read its history with a
  hand-written `SELECT` and decoded `context` itself, so a stored JSON document arrived as the
  string the driver wrote and every read threw. Reading through `Table` is now the rule: it is
  the only place that knows a column is JSON. The failure was found by a test, not by review.
- **The model is now on the shared surface**, which the boundary test enforces: the frontend
  consumes the same module the API validates with. That is the intended direction, and the
  `sharedSurface` mirrors plus path aliases must be updated together when a module is added.
- **Personal data with no delete yet.** There is no hard-delete or export surface. That is a
  documented deferral with a compliance trigger, not an oversight — see the table below.

## Alternatives considered

- **A mutable profile row with an `updated_at`.** Rejected: it cannot answer "what did the system
  know when it told me that?", which is the requirement the decision evaluator already depends
  on. It also makes every write a destructive edit of the only copy.
- **A column per field.** Rejected: it duplicates the model in DDL, invites a half-written
  context, and moves the vocabulary out of TypeScript where it is exhaustively checked. The
  fields that exist for _SQL's_ purposes — user, version, attribution, timestamps — are columns.
- **Store a computed `status` and `completion_percent` alongside the document.** Rejected: two
  sources of truth for the same fact. Changing a freshness window would leave stored statuses
  describing a policy that is no longer in force, and nothing would flag the drift.
- **Default a missing risk tolerance to `balanced`.** Rejected by ADR-0041 explicitly, and
  implemented here as a type-level fact: `emptyField()` has `value: null` with
  `source: 'assumed'`, so there is no code path that produces a value the user did not give.
- **Treat an undated `user-stated` value as current.** Rejected: it is the silent default wearing
  a source label. An undated claim gets `assumed`, which is the honest reading.
- **Require holdings for completeness.** Rejected: it would pressure users into describing a
  portfolio they may not wish to describe, and an unnecessary answer given under pressure is
  worse input than a missing one (ADR-0041 §7).
- **Make `question` findings block the save.** Rejected: it turns a legitimate combination into
  an error the user cannot clear without lying about their own trading.
- **Store the constraint text as free prose with no refusal check at all.** Rejected: it puts
  order-shaped text into a field the Agent reads. The check is deliberately about _vocabulary_,
  not semantics — it does not attempt to judge intent, and its limits are documented below.
- **Let the client send the version.** Rejected: it makes replay and version-skipping
  representable, and the audit trail the evaluator needs would depend on client correctness.

## Known limits

- The refusal pattern is a vocabulary check on prose. It catches the words in the pattern and
  nothing else; a constraint written to describe an intention without any of them is stored.
  The mitigation is that the field is named _constraint_, is rendered as a preference, and the
  Agent cannot act on anything — there is no execution path in the system at all.
- A question-severity conflict is surfaced but not persisted, so it is re-derived on the next
  read rather than recorded as having been asked.
- `assessContext` is computed on read and is therefore in the read path's latency. It is pure
  and over eleven fields, so this is not measurable; it would need revisiting only if a
  capability asked for an assessment over many users at once.
