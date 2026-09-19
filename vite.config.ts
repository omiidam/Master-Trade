import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Frontend build for the Master Trade workstation UI.
 *
 * The frontend lives in `web/` and the backend lives in `src/` — one package,
 * one modular monolith (ADR-0002). This config never imports backend code and
 * never proxies the API: the UI renders view models and mock data only.
 */
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
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
