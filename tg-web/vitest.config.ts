import { fileURLToPath, URL } from 'node:url';

import { defineWorkersProject } from '@cloudflare/vitest-pool-workers/config';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          hookTimeout: 120_000,
        },
      },
      defineWorkersProject({
        test: {
          name: 'worker',
          include: ['tests/worker/**/*.test.ts'],
          pool: '@cloudflare/vitest-pool-workers',
          poolOptions: {
            workers: {
              main: './src/runtimes/cloudflare.ts',
              miniflare: {
                assets: {
                  binding: 'ASSETS',
                  directory: './tests/worker/fixtures',
                },
                bindings: {
                  CORE_API_KEY: 'test-key',
                  CORE_API_URL: 'https://core.example.test',
                },
                compatibilityDate: '2025-09-06',
                hyperdrives: {
                  HYPERDRIVE: 'postgresql://test:test@localhost:5432/tg_web',
                },
                kvNamespaces: ['CACHE_KV'],
              },
            },
          },
        },
      }),
    ],
  },
});
