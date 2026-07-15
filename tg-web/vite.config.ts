import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@/components': fileURLToPath(new URL('./src/frontend/components', import.meta.url)),
      '@/hooks': fileURLToPath(new URL('./src/frontend/hooks', import.meta.url)),
      '@/lib': fileURLToPath(new URL('./src/frontend/lib', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: 'dist/frontend',
  },
});
