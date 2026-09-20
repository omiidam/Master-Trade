# apps/web — placeholder (not a package)

Reserved for the React workstation UI. **Nothing lives here yet**, and this directory
contains no `package.json`, so npm does not treat it as a package and nothing can be
imported from it.

Today the frontend is `web/**` (81 files) and it stays there — Phase 4.2 configured no
workspace and moved no files
([ADR-0035](../../docs/adr/ADR-0035-monorepo-migration-staged-boundary-first.md)).

**Will hold:** the 9 pages, the app shell, the design tokens and the mock fixtures from
`web/src/**`. The reusable primitives (`components/`, `design/`, `lib/`) are intended
for `packages/ui` instead, once a second consumer exists.

**Already done, and the reason this move is cheap later:** every frontend import of
backend code goes through one of 13 exact `@shared/*` specifiers rather than a relative
path. Moving the frontend does not change a single one of them — see
[monorepo.md](../../docs/monorepo.md) §2.

**Trigger to populate:** the frontend needing an independent build or publish cycle.
