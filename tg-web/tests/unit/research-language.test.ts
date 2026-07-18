import { expect, it } from 'vitest';

import { createResearch } from '../../src/frontend/lib/research';

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
