import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { sharedAlias } from './config/sharedSurface.js';

/**
 * Vitest configuration.
 *
 * Two reasons this file exists:
 *
 * 1. `vite.config.ts` points the *frontend* root at `web/`, and Vitest would otherwise
 *    treat `web/` as the project root and find no tests. The backend and
 *    architectural-invariant suites always run from the repository root against
 *    `tests/**`.
 * 2. The `@shared/*` boundary must resolve to the same files under test as in the
 *    bundle. Several suites import frontend modules directly
 *    (`tests/realtime-client.test.ts` → `web/src/realtime/client.ts`), and those modules
 *    import `@shared/*`. Without the alias the test resolver and the app resolver would
 *    disagree — a boundary that works in production and fails in CI.
 *
 * The mapping comes from `config/sharedSurface.ts`, so there is exactly one list.
 */
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: sharedAlias(root),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
