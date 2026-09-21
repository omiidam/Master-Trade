# Input quality and data reliability

**Status:** implemented (Phase 5.3). The domain, the gate, the route, the agent's refusal
path and the Profile surface all exist and are tested.

This is the layer that answers two questions **before** anything is computed from the user's
declarations:

- **How good are the declared inputs?** — presence, shape, agreement, recency and provenance,
  field by field, with no capability in mind.
- **May this analysis run, and in what form?** — the gate, against the requirements the
  capability itself declares.

They are different questions with different outputs, and keeping them apart is a design
requirement rather than an implementation detail. A report with gaps can still permit a narrow
analysis; a report with every required field present can still block one that needs a bar
series. Filtering the report to a capability's inputs would report an unrelated gap as a reason
an analysis was limited.

The principle is ADR-0041: **output quality is bounded by input quality, and confidence is the
weakest required input rather than the mean.** Where the ladder is evaluated is ADR-0044: a
pure function that runs before any model, with no path for a model to change its verdict.

## 1. The domain model

`packages/shared/src/quality/model.ts` — one module, imported by the backend and the frontend,
so the two cannot describe the same input in two vocabularies.

### Dimensions

Eight, each carrying the question it answers (`DIMENSION_QUESTION`), and each returned with a
verdict from a closed set: `ok`, `impaired`, `failed`, `not-applicable`.

| Dimension      | Question                                                               |
| -------------- | ---------------------------------------------------------------------- |
| `completeness` | Is every input this analysis requires actually present?                |
| `validity`     | Is each present value a well-formed value of its declared kind?        |
| `consistency`  | Do the values agree with each other?                                   |
| `reliability`  | How was each value obtained, and how far does that support it?         |
| `freshness`    | Is each value current against the window that belongs to its kind?     |
| `relevance`    | Is this input the one the analysis needs, at the granularity it needs? |
| `confidence`   | What is the weakest of the required inputs, taken as a minimum?        |
| `provenance`   | Can we point at where each input came from?                            |

`confidence` is a **roll-up** of the others, so it carries no issue codes of its own.
`relevance` is `not-applicable` in a context-level report, because relevance is a property of a
particular analysis, not of the context — and claiming a verdict there would be inventing one.

### One evaluated input

```ts
{
  field: InputRef,            // a FieldKey, or 'marketData'
  label: string,
  dataType: InputDataType,    // enum | enum-list | symbol-list | text-list | allocation-list | number
  representation,             // token | tokens | count | allocation | measurement | withheld | absent
  source,                     // user-stated | derived | assumed | market-data | request
  provenance: ProvenanceRef | null,
  observedAt: string | null,
  ageDays: number | null,
  freshness: 'current' | 'stale' | 'undated' | 'absent',
  validation: 'valid' | 'invalid' | 'unchecked',
  confidence: 'confirmed' | 'derived' | 'assumed' | 'untrusted' | 'missing',
  usable: boolean,
  issues: QualityIssue[],
}
```

`usable` is the single flag the gate reads. It is false for three different reasons — absent,
malformed, or present-and-declared-as-a-refusal-to-say — and the three stay distinguishable
through `freshness`, `validation` and `confidence` rather than being flattened into the flag.

### Findings

Every issue is a `{ code, severity, dimension, field, detail }` where `code` comes from a
**closed** set of twenty-two codes and `detail` is a sentence written by the code that raised
it. Neither can carry text the user wrote. That is the property that lets an assessment be
logged verbatim and displayed without a redaction pass.

Six severities, ordered, and the order is the classification precedence:
`blocking` > `conflicting` > `missing` > `stale` > `unverified` > `advisory`.

### Representations

A declaration is often personal, so an assessment carries a **shape**, never a transcript:

| Kind          | Used for                        | What it shows                                  |
| ------------- | ------------------------------- | ---------------------------------------------- |
| `token`       | a single constrained value      | the token, which is the system's own word      |
| `tokens`      | a list from a closed vocabulary | the tokens and a count                         |
| `count`       | a symbol list                   | how many, never which                          |
| `allocation`  | holdings                        | the count and the total weight, never the rows |
| `measurement` | a number                        | the value and its unit                         |
| `withheld`    | free prose, per-position detail | a reason (`free-text` / `per-position-detail`) |
| `absent`      | nothing stored                  | nothing                                        |

A token is reproduced because it is chosen from a set the system defines — `growth-oriented` is
the system's word for the user's answer. A sentence the user typed is counted and never
reproduced. `tests/quality-api.test.ts` asserts both directions against a real request.

## 2. Validation rules

Deterministic, and stated once as text in `INPUT_VALIDATION_RULES` so the code, the
documentation and the UI cannot describe different checks:

- a field the analysis requires must carry a value the user actually gave us;
- a number must be finite, and a percentage must sit inside its declared range;
- a holding weight must be positive and the allocation must not exceed a whole portfolio;
- a symbol must match the symbol pattern; a list the analysis needs must not be empty;
- an enumerated field must hold one of its enumerated tokens;
- a market or timeframe must be one the system can actually work in;
- two declarations that cannot both be true are a conflict, not a choice to be made for the user;
- a user-stated fact with no observation time is an assumption, not a fact;
- free text the user wrote is counted, never reproduced.

Two severities with teeth, and the difference is the product decision:

- **`blocking`** — allocation above 100%, a duplicate holding, a non-finite number, a malformed
  symbol, an unsupported market, a constraint written as an instruction. The value is not a
  value, and nothing may be computed from it.
- **`conflicting` / `missing` / `stale` / `unverified`** — reported, and the capability's
  declared `whenAbsent` / `whenStale` / `whenConflicting` decides whether that means ask, limit
  or block.

Contradictions come from the profile model's own rules (Phase 5.2), mapped into this vocabulary
by one function. The quality layer adds exactly one of its own — a risk/horizon tension — raised
as a **question**, never as a refusal: nothing about it says the user chose unwisely, only that
two declarations point different ways.

`NON_USABLE_TOKENS` names the two answers that are legitimate and are not inputs:
`riskTolerance: 'unspecified'` and `capitalRange: 'prefer-not-to-say'`. Treating them as
missing would invite inference into a sensitive field; treating them as present would let a
refusal stand in for a fact. They get a state of their own.

## 3. Freshness policy

Freshness is per **input kind**, not a global time-to-live, and the window is the profile
model's (Phase 5.2, ADR-0043). `freshnessOf` maps the derived context status into this layer's
vocabulary, so there is one freshness rule in the codebase rather than two that agree today.

| Status    | Meaning                                                                 |
| --------- | ----------------------------------------------------------------------- |
| `current` | inside the window for this kind of input                                |
| `stale`   | was usable, has aged out; needs refreshing, not re-asking from zero     |
| `undated` | no observation time, so recency cannot be assessed → treated as assumed |
| `absent`  | nothing stored                                                          |

A `user-stated` value with no observation time is `undated` and therefore `assumed`. An undated
claim is not a fact, and this is enforced rather than described.

Market data has its own policy at this layer: `MARKET_DATA_MAX_AGE_HOURS = 72` and
`MARKET_DATA_MIN_BARS = 100`, checked against the requirement rather than globally. A series
also has to carry a **quality report** and a permitted **provenance label** to be read at all;
bars nobody can vouch for are `UNVERIFIED` and refused, and synthetic bars are refused for an
analysis that demands measured data.

## 4. The assessment

`analyseQualityInputs({ context, marketData, now })` returns a `QualityReport`:

- `fields` — every input, evaluated, with `required` resolved against the profile's declared
  required set;
- `gaps` — inputs that are not usable at all;
- `conflicts`, `invalid` — the findings that block;
- `issues` — all of them;
- `counts` — named counts: fields, usable, missing, stale, assumed, invalid, conflicting;
- `dimensions` — the eight verdicts;
- `note` — contract text explaining what the report is and is not.

**There is no score**, and that is a decision rather than an omission. A score invites a
threshold, a threshold is a product decision hidden in a constant, and a single number cannot
say which of eight dimensions failed. The verdicts and the counts are the quantified part.

## 5. The readiness gate

`packages/shared/src/quality/readiness.ts`.

### Declared requirements

Nine `AnalysisRequirement` entries — declaring inputs, `necessity`, `whenAbsent`, `whenStale`,
`whenConflicting`, `assumable`, and why the input matters. The registry is the single place a
capability states what it needs, and `tests/quality.test.ts` asserts that every declared type
has one, that no input an answer is a function of is marked assumable, and that `capability:
'available'` is claimed only where something implements it.

| Analysis type           | Capability | Requires                                         |
| ----------------------- | ---------- | ------------------------------------------------ |
| `education.explain`     | available  | nothing required                                 |
| `portfolio.composition` | planned    | holdings                                         |
| `portfolio.risk`        | planned    | capital range, risk tolerance, horizon, holdings |
| `market.structure`      | planned    | markets, timeframe, a bar series                 |

### The decision

```ts
{
  requestedType, analysisType, capability,
  readiness,       // READY_FOR_ANALYSIS | READY_WITH_LIMITATIONS | REQUIRES_CLARIFICATION | BLOCKED
  outputMode,      // full-analysis | limited-analysis | labelled-hypothetical | clarification | refusal
  classification,  // SUFFICIENT | PARTIALLY_SUFFICIENT | INSUFFICIENT | INVALID | STALE | CONFLICTING | UNVERIFIED
  counts, dimensions, inputs, issues,
  clarifications, assumptions, limitations, analysable,
  decidedBy,       // the rule that decided it, as a stable code
  note, capabilityNote,
}
```

`classification` names the **most severe condition present**, because each one demands a
different response: correct an invalid value, resolve a conflict, answer for something absent,
refresh something out of date, record provenance, or proceed.

`decidedBy` is a stable code (`missing-required-input:holdings`, `market-data-unavailable`, …)
explained by `describeDecisionCode`, exported from the same module so a UI cannot invent its own
reading of it.

### The outcomes, and what they permit

| Readiness                | Output mode        | What the system does                                                  |
| ------------------------ | ------------------ | --------------------------------------------------------------------- |
| `READY_FOR_ANALYSIS`     | `full-analysis`    | Every declared requirement is met                                     |
| `READY_WITH_LIMITATIONS` | `limited-analysis` | Proceeds, and the limitations **travel with the answer**              |
| `REQUIRES_CLARIFICATION` | `clarification`    | Does not proceed; the questions are the answer                        |
| `BLOCKED`                | `refusal`          | Does not proceed; the reasons are listed and no assumption would help |

`labelled-hypothetical` is reachable **only** when the user declared the substitution
themselves. There is no path from a system-made guess to that output mode: an assumption with
`origin: 'system'` is reported as `permitted: false`.

### What the decision also carries

- **`analysable`** — the topics the present inputs could still support, phrased as topics rather
  than promises, because "what can still be analysed" is answerable from the input set and "what
  the answer will say" is not.
- **`limitations`** — plain sentences the answer must be read against.
- **`assumptions`** — each with its origin, whether it is permitted, and a system-worded
  statement. A `system` origin is listed to be explicit about the fact that it is refused.
- **`clarifications`** — the questions worth asking, each with its field, its reason and whether
  it is `blocking`. A bare refusal is useless, so the questions are part of it.

## 6. Where the gate runs

```
POST /v1/quality/assess ──► loadContext(repositories, principal.id)
                              │
                              ├─► analyseQualityInputs  ──► the context report
                              └─► decideReadiness ──► one decision per type
                                                          │
POST /v1/agent/messages ──► analysisType? ──► decideReadiness ──► AgentService.run(message, { readiness })
                                                                  │
                                        refusal ──► blocked turn, no model, no tools
```

`src/server/handlers/quality.ts` exports `decideReadiness` and `loadContext`, and the server
assembly passes `decideReadiness` into `agentChatHandler`. One implementation, two consumers,
so the verdict the client reads and the verdict the agent acted on cannot differ.

The refusal ordering lives in `AgentService`, not in the handler, so it does not depend on a
route remembering to check:

- `readiness === undefined` → no analysis was requested; behaviour is exactly what it was
  before this layer existed.
- `readiness === null` → an analysis **was** requested and no decision could be produced, which
  is a refusal. A server that cannot evaluate the gate does not answer an analysis request as
  though it had.
- `refusalFor` checks `capability === 'planned'` before the input verdict: a declared-but-unbuilt
  capability is a gap in the product, and blaming the user's declarations for it would be a
  false finding.
- On a permitted turn the decision is attached anyway, so `READY_WITH_LIMITATIONS` keeps its
  limitations. (This was a real defect on the synchronous path, fixed in this phase: `run()`
  returned no `readiness` on the completed branch, so the API reported `null` for a turn the
  gate had graded.)

## 7. The API

`POST /v1/quality/assess` — body `{ analysisType?, premises? }`, both optional and both
constrained (`analysisType` from the declared set, `premises` from the profile's field keys).
`premises` requires `analysisType`, because a premise is a substitution for a specific
analysis. A **body rather than a query**, deliberately: user-chosen context does not belong in
a URL, where it becomes an access-log entry — and the route _evaluates_ rather than fetches, so
it is not a cacheable representation.

The response is `QualityAssessData`: `contextSet`, `contextVersion`, the server's own
`marketData` capability, the `report`, one `decision` per requested type, `asOf`, and the note.

Three behaviours worth naming:

1. **No store, no answer.** Without a repository the handler refuses with
   `PROVIDER_UNAVAILABLE` naming `profile.store`, rather than assessing an empty context and
   reporting the user's own inputs as missing.
2. **Absent is a state, not an error.** A user who has declared nothing gets a real assessment
   of an empty context — every required field missing, every analysis limited or blocked. That
   is the truthful answer, and it is what the surface exists to show.
3. **The log carries no inputs.** Every field of a declaration can be personal, so the summary
   logs counts, codes and the version, and nothing else. The assessment is shaped so that this
   is possible: it carries representations rather than values, which is why no redaction pass
   is needed anywhere on the path.

`marketData` is supplied by the **server**, never by a client — "the data is fine" is the claim
the gate exists to check rather than believe — and defaults to nothing available, which is the
honest state until a provider is registered.

## 8. Permissions and privacy

- `quality.assess` is a registered operation, granted by **role**: `student`, `coach`, `owner`
  and `observer` hold it; `system` does not. Deny-by-default is unchanged.
- The route is `auth: 'required'` and takes **no subject**. The subject is the principal, so
  cross-user assessment is unrepresentable rather than merely forbidden.
- `profile.read` / `profile.write` remain the only operations that touch the stored context, and
  the quality route writes nothing at all.
- The operation catalogue still names no broker or execution operation, and the UI probe
  (`assertNoExecutionControls`) covers the whole quality component family, its store and the
  client method.
- `liveTradingEnabled` and `brokerExecutionEnabled` are untouched and still typed as the literal
  `false`.

## 9. The frontend surface

An in-page **Data quality** tab on the Profile surface — not a new navigation category, the same
rule the Profile and Journal modules follow. `InputQualitySummary` renders the context report;
`MissingInformationPanel` renders the gaps and the questions; `AnalysisReadinessPanel` renders
one decision per declared type, reusing `DimensionGrid`.

Nine components, all presentation-only:

| Component                   | Renders                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `InputQualitySummary`       | counts, the eight dimension verdicts, the report note          |
| `DataQualityBadge`          | any verdict, from the contract's own label maps                |
| `ValidationIssueList`       | findings, severity-ordered, each with its code and dimension   |
| `MissingInformationPanel`   | gaps and clarification questions, with a real empty state      |
| `DataFreshnessIndicator`    | freshness plus the age, against the input's own window         |
| `ProvenanceIndicator`       | source, reference, trust — and absence as a finding            |
| `AnalysisReadinessPanel`    | readiness, output mode, counts, the rule, and what is possible |
| `ClarificationQuestionCard` | one question, its reason, and whether it blocks                |
| `AssumptionNotice`          | one substitution, its origin, and whether it is permitted      |

Three rules hold across all of them: labels are imported from the contract wherever the model
exports them (a second vocabulary would eventually describe a different state); an unrecognised
token is rendered **as itself**, never prettified; and absence is rendered as a finding rather
than as a blank.

**No fixtures.** There is no mock assessment anywhere in the surface, and no fixture is shown in
place of one:
with no session the tab says so, with no answer it says so, and neither invents a verdict —
a quality verdict that was not computed would be a fabricated claim about the user's own
declarations. `tests/frontend-quality.test.ts` asserts this, along with the nine components, the
in-page tab, the vocabulary rules and the absence of execution controls.

The store (`web/src/store/quality.ts`) is deliberately thin: it sends the request and renders
what comes back. It computes no readiness, no classification and no confidence, because a client
that could derive readiness could disagree with the agent. It also reuses the **same session
resolution** the profile store uses, so the two surfaces cannot disagree about the credential in
use.

## 10. What is deterministic, and what a model may say

The distinction the phase exists to keep:

| Deterministic (code)                                      | Model (not this phase)                       |
| --------------------------------------------------------- | -------------------------------------------- |
| Which inputs a capability requires                        | How to phrase an explanation                 |
| Whether each input is present, valid, current, consistent | Which analogy makes a concept land           |
| The classification, the readiness, the output mode        | — nothing: the model cannot change a verdict |
| The counts, the findings, the question wording            | —                                            |
| The refusal, and the reasons for it                       | —                                            |

`decision.note` and `report.note` are contract text for the same reason `describeDecisionCode`
is: a client that has to invent its own wording will eventually invent its own meaning.

## 11. Storage

**No schema change in this phase, and none is needed.** The assessment is a pure function of the
current context version and the server's market-data capability, so it is reproducible from the
version it names and has no state of its own to persist. Storing it would create a second,
drifting answer to a question that can be recomputed exactly.

This is a deliberate reading of the phase brief's "if persistence is required". It is not:

- quality assessments (reproducible; versioned context is the record);
- input revisions (already append-only in `trading_context_versions`, Phase 5.2);
- provenance metadata (stored per field with the declaration).

If a future phase needs an audit trail of _which decision a turn acted on_, that belongs with
the turn's own audit record rather than in a new table — and the decision is already logged as
codes on the `quality.assess` event.

## 12. Deferred, with reasons

- **A store for assessments.** Deferred; see §11. Trigger: a requirement to answer "what did the
  system believe when it produced this answer?" for a specific past turn — which the turn's
  audit record already covers.
- **An available capability that requires an input.** No current analysis type is both
  `available` and has a required input, so the `REQUIRES_CLARIFICATION` refusal wording is
  reachable only by a capability added later. The branch exists and is tested through
  `refusalFor`; nothing produces it end to end today.
- **Real market data.** `NO_MARKET_DATA` is the server's honest state, so every analysis that
  needs bars is `BLOCKED` with `market-data-unavailable`. Wiring a provider is what changes
  that, not this layer.
- **Portfolio Intelligence and premium billing.** Not in this phase, per the brief and the
  roadmap in `product-vision-system-architecture.md` §7.
- **A numeric quality score.** Rejected, not deferred (§4).
- **LLM-written explanations of a verdict.** Not implemented. If it is ever added, it may only
  _restate_ a computed verdict, in the same words the contract already ships — never compute or
  soften one.
