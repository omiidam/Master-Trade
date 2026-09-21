# User profile and trading context

**Phase:** 5.2 · **Status:** implemented (store, API, UI) with documented deferrals
**Decision record:** [ADR-0043](./adr/ADR-0043-the-trading-context-is-derived-append-only-and-never-defaulted.md),
bound by [ADR-0041](./adr/ADR-0041-input-quality-gates-the-output.md) §8

This is the durable home for the inputs ADR-0041 requires: what the user has _declared_ about
themselves, with the provenance and observation time needed to judge it later. It stores
descriptions, never financial records — there is no quantity, price, cost basis or account
identifier anywhere in the model.

## 1. Domain model

One pure module — `packages/shared/src/profile/model.ts` — owns the whole vocabulary:
enums, field shape, freshness windows, contradiction rules, assessment and questions. It has no
clock, no database and no network, so the rules that matter are testable without a server, and
the API and the UI reach the _same_ answer. Two implementations of "is this stale?" would
eventually disagree, and the version a user sees would then be the wrong one.

### Fields

| Field             | Type                                                                            | Required | Freshness    | Notes                                                                 |
| ----------------- | ------------------------------------------------------------------------------- | -------- | ------------ | --------------------------------------------------------------------- |
| `experienceLevel` | `beginner \| intermediate \| advanced`                                          | yes      | does not age |                                                                       |
| `markets`         | array of asset class (`equity`, `fx`, `crypto`, `commodity`, `index`)           | yes      | 365 d        | mirrors the market-data `AssetClass`, so a preference and a bar agree |
| `instruments`     | array of symbol                                                                 | no       | 90 d         | bounded to 40 entries; symbol validated by pattern                    |
| `tradingStyle`    | `scalping \| day-trading \| swing \| position`                                  | yes      | does not age |                                                                       |
| `timeframe`       | `1m … 1w`                                                                       | yes      | 180 d        |                                                                       |
| `learningGoals`   | array of goal                                                                   | yes      | does not age |                                                                       |
| `capitalRange`    | **band** — `under-1k … over-250k`, `prefer-not-to-say`                          | yes      | 180 d        | never an amount                                                       |
| `riskTolerance`   | **band** — `capital-preservation \| balanced \| growth-oriented \| unspecified` | yes      | 180 d        | user-declared only; the system never assigns one                      |
| `horizon`         | `intraday \| days \| weeks \| months \| years`                                  | yes      | 365 d        |                                                                       |
| `holdings`        | array of `{ symbol, assetClass, weightPercent }`                                | **no**   | 30 d         | allocation only, bounded to 50 rows                                   |
| `constraints`     | array of `{ id, statement, source }`                                            | **no**   | does not age | prose; order-shaped text refused                                      |

`holdings` and `constraints` are deliberately **not** required: declining to describe a portfolio
must not mark a profile incomplete, and an answer given under pressure is worse input than a
missing one (ADR-0041 §7).

### Field shape

```ts
{ value: T | null, source: 'user-stated' | 'derived' | 'assumed', observedAt: string | null, note?: string }
```

`value: null` is a legitimate state meaning _the user has not told us_. There is no code path
that produces a value the user did not give: `emptyField()` is `{ value: null, source: 'assumed',
observedAt: null }`.

### Profile-level

The account row carries identity only — display name and timezone. `UserProfile` composes the
account with the current context. Completion is reported by the context assessment, not by the
account.

## 2. Trading Context schema

A context is a **versioned, append-only document**:

```ts
{ version: number, ...eleven fields..., createdAt: string }
```

- validated in full by `tradingContextSchema` (Zod, `strictObject` — an unknown key is a
  rejection, not something to ignore);
- stamped with its version by the repository, never the caller;
- stored as one JSON value in one row per version, because a column per field would duplicate
  the model and make a half-written context representable.

### Status, derived on read

`fieldStatus(field, key, now)` returns one of five, and it is **never stored**:

| Status      | Meaning                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| `confirmed` | stated by the user, inside its freshness window                           |
| `derived`   | computed from other user input                                            |
| `stale`     | stated, but aged past its window for this kind of input                   |
| `assumed`   | not stated — including a `user-stated` value with **no** observation time |
| `missing`   | no value at all                                                           |

A stored status is a second source of truth that drifts from the timestamps the moment one is
updated without the other, and changing a freshness window would leave it describing a policy no
longer in force.

### Assessment

`assessContext(context, now)` returns:

- `fields` — every field with its status, source, age in days and whether it is required;
- `completionPercent` — over **required** fields only;
- `gaps` — required fields that are missing or only assumed;
- `stale` — required fields that have aged out;
- `weakest` — `min` over the required fields' statuses, **never a mean**;
- `issues` — the contradictions, with their severities.

`weakest` is what governs. A profile that is 90% complete but rests on an assumed risk tolerance
is not a strong profile, and a mean would report it as one.

### Questions

`clarifyingPrompts(assessment)` yields, per open required field, the question and **why** it is
being asked (`missing`, `assumed` or `stale`), so re-asking never looks like a memory failure.
`FIELD_QUESTIONS` is exhaustive over `FieldKey`, so a new field cannot be added without one.

## 3. Validation rules

Two severities, and the difference is the product decision ([ADR-0041 §4–5](./adr/ADR-0041-input-quality-gates-the-output.md)):

**`reject` — impossible. The API fails the write and stores nothing.**

| Case                                   | Example                                              |
| -------------------------------------- | ---------------------------------------------------- |
| allocation exceeds a whole portfolio   | weights totalling 140%                               |
| duplicate holding                      | `AAPL` twice; combine the weights into one row       |
| horizon and timeframe cannot coexist   | `intraday` horizon on a `1w` bar                     |
| a stated fact with no observation time | `user-stated`, `observedAt: null`                    |
| an order-shaped constraint             | `"Place order 100 shares when the price drops"`      |
| schema violation                       | unknown enum value, out-of-range weight, unknown key |

**`question` — legitimate but worth confirming. The write succeeds and the finding is returned.**

| Case                                             | Why it is a question                                  |
| ------------------------------------------------ | ----------------------------------------------------- |
| scalping on a daily bar                          | the user alone knows which declaration is current     |
| position trading on a 5-minute bar               | as above                                              |
| a held instrument absent from the preferred list | a symbol's asset class is not derivable from its text |
| one declared market with several instruments     | as above                                              |

Nothing here says a choice is unwise — only that two declarations do not fit, and the user is
the one who knows which is current. A question is surfaced, never silently resolved and never
used to block a save.

### The prose/identifier distinction

`HARDLINE_OPERATION_PATTERN` and `HARDLINE_JOB_PATTERN` match **identifiers**
(`place-order`, `live_trading`), so their separators are `[._-]`. A constraint is **prose**, and
the first version of the constraint check copied those patterns — so `"Place order 100 shares"`
passed and an execution instruction was stored in a field the Agent reads. The separator class
now includes whitespace. The check is about _vocabulary_, not intent: it catches the words in the
pattern and nothing else, and it is only one of the reasons nothing could be executed anyway.

## 4. Data ownership and access rules

| Property      | Value                                             |
| ------------- | ------------------------------------------------- |
| Owner context | `profile` (`src/db/ownership.ts`)                 |
| Table         | `trading_context_versions` — one table, one owner |
| Mutability    | `append-only`                                     |
| Retention     | `by-user-request`                                 |
| Backup class  | `backed-up`                                       |
| Personal data | **yes**                                           |

There is no update and no delete. `append()` derives `nextVersion` from the current row, so a
client can neither choose, skip nor replay a version; two concurrent appends race on the unique
`(user_id, version)` index and the loser gets a typed `CONFLICT` rather than a silent overwrite.
`changedBy` is mandatory — an unattributed edit is not auditable.

### Operations and routes

| Operation       | Route             | Role grants                    |
| --------------- | ----------------- | ------------------------------ |
| `profile.read`  | `GET /v1/profile` | `owner`, `student`, `observer` |
| `profile.write` | `PUT /v1/profile` | `owner`, `student`             |

Permission is granted by role, not by default, and `observer` holds read **only** — the
read-only role can see its own context and cannot change it.

Access control is structural rather than incidental:

- the route path is exactly `/v1/profile` with **no parameters**, so there is no user id to point
  at another account;
- the handler takes its subject from the authenticated principal, never from the request;
- no repository method returns more than one user's context;
- a test asserts both the missing parameter and cross-user isolation against a real database.

An unset profile is **not** a 404: it is an all-null document plus the questions it implies, and
`GET` reports `contextSet: false` with `version: 0`. Returning an error would hide exactly the
information the surface exists to show. A refused credential is likewise reported as
`unavailable` with the resolver's reason — not as an error to retry silently.

## 5. Provenance and freshness policy

Every field carries where it came from and when it was observed, and the two are rendered
together with the value. A value without its source is a value the reader cannot weigh.

- **Freshness is per input kind, not a global TTL.** Holdings 30 d, instruments 90 d, markets and
  horizon 365 d, and the four that do not usefully change never age. One TTL would re-ask for
  what does not change and keep trusting what does.
- **An assumption never becomes a fact.** A value with `source: 'assumed'` is never `confirmed`,
  even fresh.
- **An undated claim is an assumption.** `user-stated` with `observedAt: null` is treated as
  `assumed`: recency cannot be assessed, and assuming currency is the silent default the phase
  forbids.
- **The editor never pre-fills an assumption.** Showing a default in an editable box is how an
  assumption becomes a "fact" — the user confirms a value they never chose.
- **The assessment is computed on read**, against the policy in force now, so a stored percentage
  cannot freeze the policy that produced it.

## 6. Explicitly deferred capabilities

| Deferred                                  | Why, and the trigger to revisit                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hard delete and data export**           | Retention is `by-user-request` but no export/delete surface exists. Trigger: before the feature leaves local-first use, and alongside the data-protection review (ADR-0042's release gate). |
| **Encryption at rest for profile fields** | Filesystem/database-level only today. Trigger: before any hosted deployment of the profile store.                                                                                           |
| **Derived fields**                        | `derivedField()` exists and `derived` is a first-class status, but nothing writes one yet. Trigger: the first capability that computes a context value (e.g. an allocation total).          |
| **Question findings persisted**           | Conflicts are re-derived on each read rather than recorded as having been asked. Trigger: when the Agent needs to know it already asked.                                                    |
| **Assessment over many users**            | `assessContext` runs per read. Trigger: any batch or aggregate use, which would need a different path.                                                                                      |
| **Portfolio analysis**                    | Out of scope by instruction for this phase; depends on this store existing, which it now does.                                                                                              |
| **Premium, credits, billing**             | Out of scope by instruction; blocked on its own compliance review.                                                                                                                          |
| **Personalized investment advice**        | A permanent non-goal, not a deferral — see [ADR-0042](./adr/ADR-0042-portfolio-output-is-analysis-not-advice.md).                                                                           |

## 7. Where it lives

| Concern                                          | File                                                     |
| ------------------------------------------------ | -------------------------------------------------------- |
| Domain model, schemas, assessment                | `packages/shared/src/profile/model.ts`                   |
| API contracts, route definitions, request schema | `packages/shared/src/api/contracts.ts`, `.../schemas.ts` |
| Operations and role grants                       | `packages/shared/src/auth/model.ts`                      |
| Table declaration and entity definition          | `src/db/schema.ts`                                       |
| Owner, mutability, retention, backup class       | `src/db/ownership.ts`                                    |
| Migration                                        | `src/db/migrations/0002_trading_context.ts`              |
| Repository                                       | `src/db/repositories/profile.ts`                         |
| Handlers and readiness check                     | `src/server/handlers/profile.ts`, `src/server/checks.ts` |
| Store and client calls                           | `web/src/store/profile.ts`, `web/src/api/client.ts`      |
| Components                                       | `web/src/components/profile/`                            |
| Page                                             | `web/src/pages/ProfilePage.tsx`                          |

Migration `0001_initial.ts` is **frozen**: `createSchemaSql` generates from the whole schema, so
adding a table would change 0001's checksum and every existing database would refuse to start.
`INITIAL_SCHEMA_TABLES` pins the tables 0001 owns, and `assertMigrationCoverage` asserts the union
of migration declarations is exactly the schema — so a schema addition with no migration is a
boot failure rather than a runtime "no such table".
