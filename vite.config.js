import { defineConfig } from 'vite';

// `npm run dev` startet nur den Client. Für Multiplayer lokal parallel
// `npx wrangler dev` laufen lassen – /ws wird dorthin weitergeleitet.
export default defineConfig({
  root: 'client',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: {
    proxy: { '/ws': { target: 'ws://127.0.0.1:8787', ws: true } },
  },
});
