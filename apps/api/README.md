# apps/api — placeholder (not a package)

Reserved for the backend application. **Nothing lives here yet**, and this directory
contains no `package.json`, so npm does not treat it as a package and nothing can be
imported from it.

Today the backend is `src/**` (108 files, 24 modules) at the repository root and it
stays there — Phase 4.2 configured no workspace and moved no files
([ADR-0035](../../docs/adr/ADR-0035-monorepo-migration-staged-boundary-first.md)).

**Will hold:** `src/server`, `src/api`, `src/auth`, `src/agent`, `src/llm`, `src/jobs`,
`src/realtime`, `src/config`, `src/core`, `src/storage`, `src/memory`, `src/vector`,
`src/instructions`, `src/evaluation`, `src/tools`, `src/permissions`.

**Dependency rule:** `apps/api` may consume any `packages/*`; no package may import an
app.

**Trigger to populate:** a second consumer of the shared surface, or the backend
needing an independent build/publish cycle — see §7 of
[monorepo.md](../../docs/monorepo.md).
