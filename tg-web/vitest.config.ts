import { fileURLToPath, URL } from 'node:url';

import { defineWorkersProject } from '@cloudflare/vitest-pool-workers/config';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@/components': fileURLToPath(
        new URL('./src/frontend/components', import.meta.url),
      ),
      '@/hooks': fileURLToPath(
        new URL('./src/frontend/hooks', import.meta.url),
      ),
      '@/lib': fileURLToPath(new URL('./src/frontend/lib', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    passWithNoTests: true,
    projects: [
      {
        resolve: {
          alias: {
            '@/components': fileURLToPath(
              new URL('./src/frontend/components', import.meta.url),
            ),
            '@/hooks': fileURLToPath(
              new URL('./src/frontend/hooks', import.meta.url),
            ),
            '@/lib': fileURLToPath(
              new URL('./src/frontend/lib', import.meta.url),
            ),
            '@': fileURLToPath(new URL('./src', import.meta.url)),
          },
        },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          environment: 'node',
          setupFiles: ['tests/unit/setup-i18n.ts'],
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
                  CLERK_SECRET_KEY: 'sk_test_secret',
                  VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_public',
                  CLERK_AUTHORIZED_PARTIES: 'https://example.test',
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
