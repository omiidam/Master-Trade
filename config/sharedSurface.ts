import { resolve } from 'node:path';

/**
 * The declared frontend/backend surface — one source of truth (Phase 4.2, ADR-0035 step 1).
 *
 * The frontend reaches backend code through `@shared/*` names, never through a relative
 * path. This map is what those names mean. It is **exact-match, not a directory prefix**:
 * `@shared/db/sqlite` and `@shared/server/app` do not resolve, so a UI bundle cannot pull
 * in the database driver or the HTTP server — the toolchain refuses it, not just a test.
 *
 * It is consumed by:
 *   - `vite.config.ts`  — the production bundle
 *   - `vitest.config.ts` — the test run (Vitest is Vite-based; without the alias the test
 *     resolver and the app resolver would disagree, and `web/src/realtime/client.ts`
 *     would load in the app but not under test)
 *
 * It is *mirrored*, literally, in `tsconfig.json` and `web/tsconfig.json`, because
 * TypeScript `paths` cannot read a module. `tests/monorepo-boundary.test.ts` asserts all
 * three agree on every specifier and target, so the mirrors cannot drift.
 *
 * Values are repository-relative paths to the TypeScript source, now pointing into the
 * physical `packages/shared` package (Phase 4.3, ADR-0035 step 2). Every entry must be a
 * contract (types, view models, the wire protocol) — never an implementation module.
 */
export const SHARED_SURFACE: Readonly<Record<string, string>> = {
  '@shared/api/contracts': 'packages/shared/src/api/contracts.ts',
  // The capability *model*, not the registry. The registry is the server's declaration and reaches a
  // client through `GET /v1/capabilities`, already resolved; shipping the declaration itself across
  // the boundary would be a second copy of the catalogue, and the boundary test refuses an entry
  // the frontend does not consume — which is how the two stay one thing.
  '@shared/capabilities/model': 'packages/shared/src/capabilities/model.ts',
  '@shared/core/errors': 'packages/shared/src/core/errors.ts',
  '@shared/core/headers': 'packages/shared/src/core/headers.ts',
  '@shared/core/ids': 'packages/shared/src/core/ids.ts',
  '@shared/core/provenance': 'packages/shared/src/core/provenance.ts',
  '@shared/decisions/model': 'packages/shared/src/decisions/model.ts',
  '@shared/decisions/readiness': 'packages/shared/src/decisions/readiness.ts',
  '@shared/desktop/ipc': 'packages/shared/src/desktop/ipc.ts',
  '@shared/frontend/viewModels': 'packages/shared/src/frontend/viewModels.ts',
  '@shared/jobs/service': 'packages/shared/src/jobs/service.ts',
  '@shared/marketdata/provider': 'packages/shared/src/marketdata/provider.ts',
  '@shared/portfolio/model': 'packages/shared/src/portfolio/model.ts',
  '@shared/portfolio/readiness': 'packages/shared/src/portfolio/readiness.ts',
  '@shared/profile/model': 'packages/shared/src/profile/model.ts',
  '@shared/quality/model': 'packages/shared/src/quality/model.ts',
  '@shared/quality/readiness': 'packages/shared/src/quality/readiness.ts',
  '@shared/realtime/contracts': 'packages/shared/src/realtime/contracts.ts',
  '@shared/realtime/events': 'packages/shared/src/realtime/events.ts',
  '@shared/realtime/protocol': 'packages/shared/src/realtime/protocol.ts',
  '@shared/types': 'packages/shared/src/types.ts',
  '@shared/usage/credits': 'packages/shared/src/usage/credits.ts',
  '@shared/usage/entitlements': 'packages/shared/src/usage/entitlements.ts',
  '@shared/usage/features': 'packages/shared/src/usage/features.ts',
  '@shared/usage/plans': 'packages/shared/src/usage/plans.ts',
};

/** Every specifier the frontend may import across the boundary. */
export function sharedSpecifiers(): string[] {
  return Object.keys(SHARED_SURFACE);
}

/**
 * Vite/Rollup alias entries, resolved against the repository root.
 *
 * A plain resolver map: no plugin, no dependency. Rollup matches a string `find` by
 * prefix, but no key here is a prefix of another, so each entry matches exactly one
 * specifier.
 */
export function sharedAlias(root: string): { find: string; replacement: string }[] {
  return Object.entries(SHARED_SURFACE).map(([find, file]) => ({
    find,
    replacement: resolve(root, file),
  }));
}
