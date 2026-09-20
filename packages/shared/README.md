# packages/shared — the first package to extract (placeholder, not a package)

Reserved for the **declared frontend/backend surface** — the 13 `@shared/*` modules.
**Nothing lives here yet** (no files have been moved), and this directory contains no
`package.json` yet, so npm does not treat it as a package and nothing can be imported
from it.

**This is the only package justified today.** It is the one module set with **two
consumers**: the frontend (`web/src/**`, 18 files) and the backend (`src/**`). The
other five proposed packages each have one.

**Its layout already exists — as `@shared/*`.** Phase 4.2 replaced 27 relative
specifiers with 13 exact names, so extraction is mechanical: move the modules here,
add a real `package.json`, and repoint the alias target from `src/…` to
`packages/shared/…`. **No consumer import changes** — that is the entire point of doing
the boundary first. Mapping table: [monorepo.md](../../docs/monorepo.md) §2.

**Contents:** `src/types.ts`, `src/core/{errors,headers,ids,provenance}.ts`,
`src/api/contracts.ts`, `src/desktop/ipc.ts`, `src/frontend/viewModels.ts`,
`src/jobs/service.ts`, `src/marketdata/provider.ts`,
`src/realtime/{contracts,events,protocol}.ts`.

**Trigger:** none required beyond a reviewed change — this is the next step
([ADR-0035 step 2](../../docs/adr/ADR-0035-monorepo-migration-staged-boundary-first.md)).
