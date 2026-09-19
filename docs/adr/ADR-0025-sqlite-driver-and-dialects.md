# ADR-0025 — SQLite driver becomes `node:sqlite`, and both engines share one dialect

- **Status:** Accepted (Phase 3.4, decision ids `DEC-DB-1-LOCAL`, `DEC-DB-2-PRODUCTION`). Supersedes the **driver and ORM** halves of [ADR-0016](./ADR-0016-persistence-driver-and-orm.md); the engine choice (SQLite, [ADR-0003](./ADR-0003-sqlite-first.md)) is unchanged.
- **Date:** 2026-09-19
- **Related:** [ADR-0023](./ADR-0023-repository-boundary-and-data-ownership.md), [ADR-0024](./ADR-0024-generated-migrations-and-ledger.md)

## Context

ADR-0016 locked **better-sqlite3 + Drizzle**. Phase 3.4 is the first phase that
actually installs and uses a database, and it produced evidence that the locked
driver could not be installed or run in the target environment:

```
npm install better-sqlite3@^11.7.0
→ npm error gyp ERR! stack Error: Could not find any Visual Studio installation to use
→ npm error gyp ERR! command ... node-gyp rebuild --release
→ node -v v24.20.0   (no prebuilt binary for this Node ABI)
```

That is exactly risk **R15** ("native module breaks on a Node ABI or platform
change"): a desktop product whose storage engine needs a compiler is a product that
fails to update on someone else's machine. While choosing the replacement, the
production question had to be answered too — PostgreSQL was "prepared but
deferred", and a deferred engine that requires a second implementation of the
domain is not prepared at all.

## Decision

**1. Local mode: `node:sqlite`, the SQLite engine built into Node.js.**
Zero dependencies, no native build step, no ABI risk on upgrade. Settings on open:
WAL, `foreign_keys = ON` (the governance checks depend on it), `busy_timeout`,
`synchronous = NORMAL`. `better-sqlite3` remains the documented **fallback
driver**: it is a driver swap behind the `SqlExecutor` port, not a rewrite.

**2. Both modes share one declaration set through a dialect.** `src/db/dialect.ts`
owns the only differences: storage types (`json` → TEXT/JSONB, `boolean` →
INTEGER/BOOLEAN, `timestamp` → TEXT/TIMESTAMPTZ), `?` → `$1…$n` placeholder
rewriting, and value codecs so a repository deals in `boolean` and parsed objects
regardless of engine. Ids map to TEXT on both engines on purpose: they are prefixed
strings (`usr_…`), and a native UUID column would reject them.

**3. Production mode takes an injected client.** `openPostgres({ client })` is real
code over the `PgQueryable` slice; `pg` is added when a server exists, because a
dependency whose only value is hypothetical is a cost. The production path is still
verified: the test suite drives it with a recording client and asserts the exact
SQL and parameters a PostgreSQL server would receive, including that no `?`
placeholder survives.

**4. No ORM.** Drizzle was rejected as the access layer (see ADR-0023 for the
reasoning, including that it would be a second schema definition). The schema
declarations, DDL generation and migrations are ours and reviewable; a query
builder can be adopted later as an adapter behind the same port if it earns its
place.

**5. The Node floor moves to 22.5.** `node:sqlite` arrived in Node 22.5 (flagged
there, default from 23). `engines.node` is `>=22.5`, the CI matrix is Node 22 and
24, and a runtime without the built-in produces a typed `PROVIDER_UNAVAILABLE`
with a remediation hint rather than a crash at import time; the database suites
skip on such a runtime with a recorded reason instead of failing.

## Alternatives rejected

| Alternative                                       | Why rejected                                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep better-sqlite3 and add a build toolchain     | Requires Visual Studio on every contributor and packaging machine; a native module that must be rebuilt per Node ABI is the exact desktop-upgrade risk R15 names. |
| `better-sqlite3` with a pinned Node 20/22 sidecar | Pins the desktop runtime to an old ABI forever, and still needs prebuilt binaries per platform.                                                                   |
| `sql.js` (SQLite compiled to WebAssembly)         | In-memory with manual persistence: no WAL, no real transactions across processes, and the whole database in memory — wrong for a six-month record.                |
| `libsql` / `@libsql/client`                       | A network-oriented client for a single-user local file; adds a dependency and an edge runtime story we do not need.                                               |
| PostgreSQL as the _only_ engine                   | Turns a desktop training tool into a client/server deployment: install, run and secure a server for one local user.                                               |
| Two repository implementations (one per engine)   | Doubles the code that must stay behaviourally identical, and the divergence would be found by users, not tests.                                                   |
| An ORM to hide the dialect difference             | Would not remove the difference (types and placeholders still differ), and would add a schema that can drift from the declarations.                               |
| Async-only via a pooled driver for both engines   | SQLite in-process is synchronous; a pool adds complexity with no concurrency to gain. Wrapping the sync driver in the async port costs nothing.                   |

## Consequences

**Positive:** `npm install` has no compiler step; the same declarations,
migrations and repositories serve both engines; a driver swap (including back to
better-sqlite3) touches one file; production mode is testable without a server.

**Negative:** the minimum Node version rises to 22.5, which is a real constraint
for anyone on Node 20 LTS (documented in the README and the run doc); `node:sqlite`
is still labelled experimental upstream, so its API could change — mitigated by the
port, which confines that risk to `src/db/sqlite.ts`.

**Security impact:** positive. `foreign_keys = ON` plus the schema CHECK
constraints mean the governance rules hold at the storage layer; dropping a native
build step removes a supply-chain surface (no postinstall compilation of a
third-party binary).

## References

- [database-and-storage.md](../database-and-storage.md), [technology-decisions.md § 3](../technology-decisions.md)
- `src/db/dialect.ts`, `src/db/sqlite.ts`, `src/db/postgres.ts`, `src/db/repositories/index.ts`
