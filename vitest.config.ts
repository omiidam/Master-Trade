import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
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
    /**
     * The browser suite is excluded, and the exclusion is load-bearing.
     *
     * The broad include above would otherwise collect the `tests/browser` directory, which
     * needs a built `web/dist` and an installed Chromium-family browser. That would quietly
     * make the
     * hermetic suite depend on both: green locally after a build, red on a clean clone and
     * on any machine without Chrome. It has its own config (`vitest.browser.config.ts`)
     * and its own script (`npm run test:e2e`), and `npm run validate` runs both.
     *
     * `tests/test-hygiene.test.ts` asserts this exclusion holds, so the browser suite
     * cannot drift back into the run that must stay dependency-free.
     */
    exclude: [...configDefaults.exclude, 'tests/browser/**'],
    environment: 'node',
    /**
     * Timeouts sized for the runner, not for an idle developer machine.
     *
     * Every suite under `tests/` boots real infrastructure: a Fastify instance
     * through `inject`, a real SQLite file, a real WebSocket session. The vitest
     * default of 5000ms is a wall-clock assumption about how fast that boot is —
     * and the stated deployment target is a 2-core / 4GB VPS. Under CPU
     * contention a suite that finishes in ~800ms on an idle machine was measured
     * at 6628ms, so `usage-api.test.ts` failed with "Test timed out in 5000ms"
     * while asserting nothing about timing.
     *
     * This raises the *budget*, not the bar: no assertion is relaxed, no test is
     * skipped, and a test that hangs still fails — just later. Kept generous
     * rather than tuned to the slowest machine observed, because a timeout should
     * never be the thing that decides whether the code is correct.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
