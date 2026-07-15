import { defineConfig } from '@playwright/test';

const port = 8790;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        browserName: 'chromium',
        isMobile: true,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command:
      'pnpm build && pnpm build:node && DATABASE_URL=postgresql://unused:unused@127.0.0.1:65432/unused REDIS_URL=redis://127.0.0.1:65433 CORE_API_URL=http://127.0.0.1:65434 CORE_API_KEY=test-only-key PORT=8790 node dist/backend/node.js',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
  },
});
