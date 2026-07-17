import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  databaseUrlFromEnv,
  loadEnvFile,
} from '../../src/backend/database/migrate-cli';

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

describe('migrate env loading', () => {
  it('overrides stale shell values from tg-web/.env', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tg-web-migrate-'));
    const path = join(directory, '.env');
    writeFileSync(
      path,
      'DATABASE_URL=postgresql://file-user:file-pass@127.0.0.1:5432/tradingagents\n',
    );
    process.env.DATABASE_URL =
      'postgresql://shell-user:shell-pass@127.0.0.1:5432/tradingagents';

    loadEnvFile(path, { override: true });

    expect(process.env.DATABASE_URL).toBe(
      'postgresql://file-user:file-pass@127.0.0.1:5432/tradingagents',
    );
  });

  it('requires a credentialed DATABASE_URL', () => {
    expect(() =>
      databaseUrlFromEnv({
        DATABASE_URL: 'postgresql://127.0.0.1:5432/tradingagents',
      }),
    ).toThrow(/username and password/);

    expect(
      databaseUrlFromEnv({
        DATABASE_URL:
          'postgresql://tradingagents:secret@127.0.0.1:5432/tradingagents',
      }),
    ).toBe('postgresql://tradingagents:secret@127.0.0.1:5432/tradingagents');
  });
});
