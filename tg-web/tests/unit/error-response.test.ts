import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../src/backend/errors/app-error';
import { toErrorResponse } from '../../src/backend/errors/error-response';
import { Logger, type LogEntry } from '../../src/backend/logging/logger';
import { createRequestIdMiddleware } from '../../src/backend/logging/request-id';

describe('toErrorResponse', () => {
  it('does not expose an internal cause', () => {
    const response = toErrorResponse(
      new AppError(
        'CORE_UNAVAILABLE',
        503,
        'Core unavailable',
        new Error('token=secret'),
      ),
      'req-7',
    );

    expect(response).toEqual({
      error: {
        code: 'CORE_UNAVAILABLE',
        message: 'Core unavailable',
        requestId: 'req-7',
      },
    });
    expect(JSON.stringify(response)).not.toContain('secret');
  });

  it('returns a generic response for unknown errors', () => {
    expect(
      toErrorResponse(new Error('database password=secret'), 'req-8'),
    ).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: 'req-8',
      },
    });
  });
});

describe('Logger', () => {
  it('redacts credential metadata before writing a structured log entry', () => {
    const entries: LogEntry[] = [];
    const logger = new Logger((entry) => entries.push(entry));

    logger.warn('Core request failed', {
      authorization: 'Bearer secret',
      nested: { cookie: 'session=secret' },
      endpoint: 'https://user:password@core.example.test/health',
      requestId: 'req-9',
    });

    expect(entries).toEqual([
      {
        level: 'warn',
        message: 'Core request failed',
        metadata: {
          authorization: '[REDACTED]',
          nested: { cookie: '[REDACTED]' },
          endpoint: '[REDACTED]',
          requestId: 'req-9',
        },
      },
    ]);
  });

  it('redacts camelCase configuration keys recursively', () => {
    const entries: LogEntry[] = [];
    const logger = new Logger((entry) => entries.push(entry));
    const databaseUrl = 'postgresql://database.example.test/tg';
    const redisUrl = 'redis://cache.example.test:6379';

    logger.info('Loaded runtime configuration', {
      coreApiKey: 'core-secret',
      nested: { databaseUrl, redisUrl },
    });

    const serializedEntries = JSON.stringify(entries);
    expect(serializedEntries).not.toContain('core-secret');
    expect(serializedEntries).not.toContain(databaseUrl);
    expect(serializedEntries).not.toContain(redisUrl);
    expect(entries[0]?.metadata).toEqual({
      coreApiKey: '[REDACTED]',
      nested: { databaseUrl: '[REDACTED]', redisUrl: '[REDACTED]' },
    });
  });
});

describe('createRequestIdMiddleware', () => {
  it('preserves a valid inbound request ID and emits it as a response header', async () => {
    const app = new Hono();
    app.use('*', createRequestIdMiddleware());
    app.get('/', (context) => context.text('ok'));

    const response = await app.request('/', {
      headers: { 'x-request-id': 'req-from-client' },
    });

    expect(response.headers.get('x-request-id')).toBe('req-from-client');
  });

  it('replaces an overlong inbound request ID', async () => {
    const app = new Hono();
    app.use('*', createRequestIdMiddleware());
    app.get('/', (context) => context.text('ok'));

    const response = await app.request('/', {
      headers: { 'x-request-id': 'a'.repeat(129) },
    });

    expect(response.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
