import { expect, test } from '@playwright/test';

test('renders the SPA shell and handles a deep link', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toContainText('TradingAgents');

  await page.goto('/analysis/history');
  await expect(page.getByRole('main')).toBeVisible();
});

test('keeps API failures as JSON', async ({ request }) => {
  const response = await request.get('/api/unknown');

  expect(response.status()).toBe(404);
  await expect(response.json()).resolves.toMatchObject({
    error: { code: 'NOT_FOUND' },
  });
});
