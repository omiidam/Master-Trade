import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { sharedAlias } from './config/sharedSurface.js';

/**
 * Runner configuration for the browser end-to-end suite (Phase 5.10).
 *
 * Why this is a second config rather than more tests in `tests/`
 * -------------------------------------------------------------
 * The suites under `tests/` are offline, hermetic and fast: they boot a Fastify instance
 * through `inject`, open a SQLite file in a temp directory, and assert against values.
 * They deliberately need nothing installed and nothing built.
 *
 * The browser suite is the opposite on both counts. It needs a **built frontend**
 * (`web/dist`) and a **Chromium-family browser on the host**, and a missing browser is a
 * property of the machine rather than a defect in the code. Folding it into
 * `vitest.config.ts` would mean `npm test` fails on a machine without Chrome, or worse,
 * that `npm test` starts passing only after `npm run build:web` — the ordinary unit run
 * would silently depend on a build that the unit run does not need.
 *
 * So the boundary is drawn at the config: `npm test` stays hermetic and green anywhere,
 * and `npm run test:e2e` runs the browser suite. `npm run validate` runs both, in an
 * order that produces the build first, so the full gate still means what it says.
 *
 * `tests/test-hygiene.test.ts` asserts that both configs declare their own files, so a
 * suite cannot go missing by being dropped from a config.
 */
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: sharedAlias(root),
  },
  test: {
    include: ['tests/browser/**/*.test.ts'],
    environment: 'node',
    /**
     * Browser tests share one launched browser and one static server, and each case
     * navigates and re-renders a real page. Serial execution is what makes the timings
     * reproducible; the whole suite is a single file in practice.
     */
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
