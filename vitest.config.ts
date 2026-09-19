import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration.
 *
 * It exists because `vite.config.ts` points the *frontend* root at `web/`, and
 * Vitest would otherwise treat `web/` as the project root and find no tests.
 * The backend and architectural-invariant suites always run from the repository
 * root against `tests/**`.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
