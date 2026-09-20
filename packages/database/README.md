# packages/database — placeholder (not a package)

Reserved for the persistence layer. **Nothing lives here yet**, and this directory
contains no `package.json`, so npm does not treat it as a package and nothing can be
imported from it.

Today it is `src/db/**` (schema, dialects, migrations, repositories, the SQLite and
PostgreSQL executors) and it stays there — Phase 4.2 moved no files.

**Why it is deferred:** it has exactly one consumer. Package directories exist to be
shared ([ADR-0035](../../docs/adr/ADR-0035-monorepo-migration-staged-boundary-first.md)).

**Nothing in the frontend may import this**, before or after extraction: the driver is
an implementation detail, not a contract. The `@shared/*` surface deliberately
contains no entry for it, so the import does not resolve.

**Trigger to populate:** a second consumer — a worker process, a migration CLI run
independently of the API, or an independent release cycle.
