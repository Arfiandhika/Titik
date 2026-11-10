import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Run from the repo root: `vite --config client/vite.config.js`.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: 'public', // manifest, service worker and app icons, served at fixed URLs
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});
