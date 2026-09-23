import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { sharedAlias } from './config/sharedSurface.js';

/**
 * Frontend build for the Master Trade workstation UI.
 *
 * The frontend lives in `web/` and the backend lives in `src/` — one package, one
 * modular monolith (ADR-0002). This config never proxies the API: the UI renders
 * view models and mock data only.
 *
 * `@shared/*` (Phase 4.2, ADR-0035 step 1) is the declared frontend/backend boundary;
 * the mapping lives once in `config/sharedSurface.ts` and is mirrored in both tsconfigs.
 * Vite does not read TypeScript `paths`, which is why it needs the alias at all.
 *
 * Source maps are opt-in (Phase 6.5). `web/dist` is not a public directory — it is the
 * `frontendDist` that the desktop bundle ships — so `sourcemap: true` put a map of the whole
 * frontend inside the installer, which is a release artefact nobody can unrelease. It was
 * switched off rather than trimmed, because the check that guards the bundle
 * (`package.no-source-maps` in `src/desktop/packaging.ts`) refuses *any* map, and a rule with an
 * exception is a rule nobody can verify. Local debugging asks for one explicitly:
 *
 *     MASTER_TRADE_SOURCEMAPS=1 npm run build:web
 */
const root = dirname(fileURLToPath(import.meta.url));
const sourceMaps = process.env.MASTER_TRADE_SOURCEMAPS === '1';

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: sharedAlias(root),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: sourceMaps,
  },
});
