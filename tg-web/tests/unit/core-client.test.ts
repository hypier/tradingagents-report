import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../src/backend/errors/app-error';
import { CoreClient } from '../../src/backend/core/client';

describe('CoreClient', () => {
  it('sends the Core bearer token only from the server client', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: 'ok', database: 'ok', detail: null }),
        ),
      );
    const client = new CoreClient(
      new URL('https://core.example.test'),
      'server-secret',
      fetchMock,
    );

    await client.healthcheck();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://core.example.test/health',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.anything(),
        }),
      }),
    );
  });

  it('uses the server bearer token for protected Core requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'analysis-1' })));
    const client = new CoreClient(
      new URL('https://core.example.test'),
      'server-secret',
      fetchMock,
    );

    await client.submitAnalysis({ ticker: 'NVDA' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://core.example.test/api/v1/analyses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer server-secret',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('maps unavailable Core responses to a safe application error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('down', { status: 503 }));
    const client = new CoreClient(
      new URL('https://core.example.test'),
      'server-secret',
      fetchMock,
    );

    await expect(client.healthcheck()).rejects.toEqual(
      new AppError(
        'CORE_UNAVAILABLE',
        503,
        'Analysis service is temporarily unavailable',
      ),
    );
  });
});
