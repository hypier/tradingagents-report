import { expect, test } from '@playwright/test';

test('renders the SPA shell and handles a deep link', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toContainText(
    'Run multi-agent analysis',
  );
  await expect(
    page.getByRole('heading', { name: 'Agent activity' }),
  ).toBeVisible();

  await page.goto('/analysis/history');
  await expect(page.getByRole('main')).toBeVisible();
});

test('submits a selected instrument for analysis', async ({ page }) => {
  let submittedBody: Record<string, unknown> | undefined;

  await page.route('**/api/market-search?q=*', async (route) => {
    await route.fulfill({
      json: {
        data: [
          {
            ticker: 'AAPL',
            exchange: 'NASDAQ',
            symbol: 'AAPL',
            display_ticker: 'AAPL',
            provider_symbol: 'NASDAQ:AAPL',
            display_name: 'Apple Inc.',
          },
        ],
        requestId: 'request-search',
      },
    });
  });
  await page.route('**/api/analyses/estimate', async (route) => {
    await route.fulfill({
      json: {
        data: {
          estimatedCostUsd: '1.00000000',
          reservedPoints: 132,
          source: 'default',
          sampleCount: 0,
        },
        requestId: 'request-estimate',
      },
    });
  });
  await page.route('**/api/analyses', async (route) => {
    if (route.request().method() === 'POST') {
      submittedBody = route.request().postDataJSON() as Record<
        string,
        unknown
      >;
      await route.fulfill({
        status: 201,
        json: { data: { id: 'job-created' }, requestId: 'request-create' },
      });
      return;
    }
    await route.fulfill({
      json: { data: [], requestId: 'request-list' },
    });
  });

  await page.goto('/');
  await page.getByRole('combobox', { name: 'Instrument' }).fill('AAPL');
  await page.getByRole('option', { name: /Apple Inc\./ }).click();
  await page
    .getByRole('button', { name: 'Run analysis (reserve 132 points)' })
    .click();

  await expect.poll(() => submittedBody).toBeDefined();
  expect(submittedBody).toMatchObject({
    ticker: 'AAPL',
    analysts: ['market', 'fundamentals', 'news', 'social'],
    instrument: {
      exchange: 'NASDAQ',
      symbol: 'AAPL',
      display_ticker: 'AAPL',
    },
  });
  await expect(page.getByText('Research run submitted.')).toBeVisible();
});

test('submits a direct ticker when market search metadata is unavailable', async ({
  page,
}) => {
  let submittedBody: Record<string, unknown> | undefined;

  await page.route('**/api/market-search?q=*', async (route) => {
    await route.fulfill({
      json: {
        data: [
          {
            ticker: 'AAPL',
            exchange: null,
            symbol: 'AAPL',
            display_ticker: 'AAPL',
            provider_symbol: null,
            display_name: 'AAPL',
            is_primary_listing: true,
          },
        ],
        requestId: 'request-search',
      },
    });
  });
  await page.route('**/api/analyses/estimate', async (route) => {
    await route.fulfill({
      json: {
        data: {
          estimatedCostUsd: '1.00000000',
          reservedPoints: 132,
          source: 'default',
          sampleCount: 0,
        },
        requestId: 'request-estimate',
      },
    });
  });
  await page.route('**/api/analyses', async (route) => {
    if (route.request().method() === 'POST') {
      submittedBody = route.request().postDataJSON() as Record<
        string,
        unknown
      >;
      await route.fulfill({
        status: 201,
        json: { data: { id: 'job-created' }, requestId: 'request-create' },
      });
      return;
    }
    await route.fulfill({ json: { data: [], requestId: 'request-list' } });
  });

  await page.goto('/');
  await page.getByRole('combobox', { name: 'Instrument' }).fill('AAPL');
  await page.getByRole('option', { name: /AAPL/ }).click();
  await page
    .getByRole('button', { name: 'Run analysis (reserve 132 points)' })
    .click();

  await expect.poll(() => submittedBody).toBeDefined();
  expect(submittedBody).toMatchObject({ ticker: 'AAPL' });
  expect(submittedBody).not.toHaveProperty('instrument');
});

test('keeps API failures as JSON', async ({ request }) => {
  const response = await request.get('/api/unknown');

  expect(response.status()).toBe(404);
  await expect(response.json()).resolves.toMatchObject({
    error: { code: 'NOT_FOUND' },
  });
});

test('opens a completed Core report from the research library', async ({
  page,
}) => {
  await page.route('**/api/analyses', async (route) => {
    await route.fulfill({
      json: {
        data: [
          {
            id: 'job-1',
            ticker: 'AAPL',
            status: 'succeeded',
            analysts: ['market'],
            updated_at: '2026-07-15T10:00:00Z',
          },
        ],
        requestId: 'request-1',
      },
    });
  });
  await page.route('**/api/analyses/job-1', async (route) => {
    await route.fulfill({
      json: {
        data: {
          id: 'job-1',
          ticker: 'AAPL',
          status: 'succeeded',
          reports: { market_report: 'Core-generated market report.' },
        },
        requestId: 'request-2',
      },
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'View report for AAPL' }).click();
  await expect(page).toHaveURL(/\/reports\/job-1$/);
  await expect(page.getByRole('heading', { name: 'AAPL' })).toBeVisible();
  await expect(page.getByText('Research report', { exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(
    'Core-generated market report.',
  );
});
