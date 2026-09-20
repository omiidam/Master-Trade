# packages/ui — placeholder (not a package)

Reserved for the reusable UI primitives. **Nothing lives here yet**, and this directory
contains no `package.json`, so npm does not treat it as a package and nothing can be
imported from it.

Today the design tokens, the ~45 components and the helpers are in `web/src/design`,
`web/src/components` and `web/src/lib`, and they stay there — Phase 4.2 moved no files.

**Why it is deferred:** it has exactly one consumer. A UI package is for sharing a
design system across surfaces; a single application does not need one
([ADR-0035](../../docs/adr/ADR-0035-monorepo-migration-staged-boundary-first.md)).

Note the existing internal boundary that already works: the frontend's own primitives
are re-exported through `web/src/components/index.ts`, and `web/src/components` already
groups by module (`exams/`, `memory/`, `research/`, `realtime/`, `charts/`).

**Trigger to populate:** a second rendering surface — a marketing/landing app, an admin
console, or a documented public design-system release.
