import { expect, test } from '@playwright/test';

test('renders the SPA shell and handles a deep link', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toContainText('Research command');
  await expect(page.getByRole('heading', { name: 'Sequential agent activity' })).toBeVisible();

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

test('opens a completed Core report from the research library', async ({ page }) => {
  await page.route('**/api/analyses', async (route) => {
    await route.fulfill({ json: { data: [{ id: 'job-1', ticker: 'AAPL', status: 'completed', analysts: ['market'], updated_at: '2026-07-15T10:00:00Z' }], requestId: 'request-1' } });
  });
  await page.route('**/api/analyses/job-1', async (route) => {
    await route.fulfill({ json: { data: { id: 'job-1', ticker: 'AAPL', status: 'completed', reports: { market_report: 'Core-generated market report.' } }, requestId: 'request-2' } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Actions for AAPL' }).click();
  await page.getByRole('menuitem', { name: 'View report' }).click();
  await expect(page.getByRole('dialog')).toContainText('Core-generated market report.');
});
