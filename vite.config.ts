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
 */
const root = dirname(fileURLToPath(import.meta.url));

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
    sourcemap: true,
  },
});
