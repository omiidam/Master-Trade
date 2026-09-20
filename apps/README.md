# apps/ — target structure (documentation marker)

Reserved for the three Master Trade applications:

| Directory  | Will hold                                                       | Lives today in                      |
| ---------- | --------------------------------------------------------------- | ----------------------------------- |
| `desktop/` | the Tauri shell, its Rust commands and the sidecar launch plan  | `src-tauri/**` + `src/desktop/**`   |
| `web/`     | the React workstation UI, design tokens and preview fixtures    | `web/**`                            |
| `api/`     | the Fastify backend: contracts, auth, agent, jobs, realtime, db | `src/**` (minus the shared surface) |

**Nothing has been moved.** Phase 4.2 implemented only the `@shared/*` boundary
([monorepo.md](../docs/monorepo.md)); no workspace was configured and no
`package.json` exists under `apps/`, so npm does not treat these as packages and
nothing can be imported from them. This is asserted by
`tests/monorepo-boundary.test.ts`.

Each subdirectory README states what will move there and the trigger that fires it
(§6 of [monorepo-assessment.md](../docs/monorepo-assessment.md)). See
[ADR-0035](../docs/adr/ADR-0035-monorepo-migration-staged-boundary-first.md) for why
the migration is staged rather than done.
