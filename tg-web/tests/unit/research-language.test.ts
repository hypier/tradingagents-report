import { expect, it } from 'vitest';

import { createResearch, listResearch } from '../../src/frontend/lib/research';

it('sends the selected report language as a Core config override', async () => {
  let body = '';
  const fetchImplementation = async (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    body = String(init?.body);
    return new Response(
      JSON.stringify({ data: { id: 'job-1' }, requestId: 'request-1' }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 202,
      },
    );
  };

  await createResearch(
    {
      analysts: ['market'],
      outputLanguage: 'Japanese',
      ticker: 'AAPL',
      tradeDate: '2026-07-16',
    } as Parameters<typeof createResearch>[0],
    fetchImplementation,
  );

  expect(JSON.parse(body)).toEqual({
    analysts: ['market'],
    configOverrides: { output_language: 'Japanese' },
    ticker: 'AAPL',
    tradeDate: '2026-07-16',
    requestId: expect.any(String),
  });
});

it('sends confirmed instrument display metadata with the research request', async () => {
  let body = '';
  const fetchImplementation = async (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    body = String(init?.body);
    return new Response(
      JSON.stringify({ data: { id: 'job-1' }, requestId: 'request-1' }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 202,
      },
    );
  };

  await createResearch(
    {
      analysts: ['market'],
      outputLanguage: 'Chinese',
      ticker: '0700.HK',
      tradeDate: '2026-07-16',
      instrument: {
        exchange: 'HKEX',
        symbol: '700',
        display_ticker: '0700.HK',
      },
      display: {
        display_name: 'Tencent Holdings Ltd.',
        logo_url: 'https://example.test/tencent.svg',
      },
    },
    fetchImplementation,
  );

  expect(JSON.parse(body)).toEqual({
    analysts: ['market'],
    configOverrides: { output_language: 'Chinese' },
    ticker: '0700.HK',
    tradeDate: '2026-07-16',
    requestId: expect.any(String),
    instrument: {
      exchange: 'HKEX',
      symbol: '700',
      display_ticker: '0700.HK',
    },
    display: {
      display_name: 'Tencent Holdings Ltd.',
      logo_url: 'https://example.test/tencent.svg',
    },
  });
});

it('passes the report status filter to the analysis list endpoint', async () => {
  let path = '';
  const fetchImplementation = async (input: RequestInfo | URL) => {
    path = String(input);
    return new Response(JSON.stringify({ data: [], requestId: 'request-1' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await listResearch(
    { limit: 50, offset: 100, status: 'succeeded' },
    fetchImplementation,
  );

  expect(path).toBe('/api/analyses?limit=50&offset=100&status=succeeded');
});
