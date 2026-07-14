import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppDependencies } from '../../src/backend/app';
import { Logger } from '../../src/backend/logging/logger';
import { startNodeRuntime } from '../../src/runtimes/node';

const temporaryDirectories: string[] = [];

function fakeDependencies(): AppDependencies {
  return {
    database: { healthcheck: vi.fn().mockResolvedValue(undefined) },
    cache: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      healthcheck: vi.fn().mockResolvedValue(undefined),
    },
    core: {
      healthcheck: vi.fn().mockResolvedValue(undefined),
      submitAnalysis: vi.fn(),
      listAnalyses: vi.fn(),
      getAnalysis: vi.fn(),
      getAnalysisEvents: vi.fn(),
    },
    logger: new Logger(),
  };
}

async function createAssetsDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tg-web-assets-'));
  temporaryDirectories.push(directory);
  await writeFile(directory + '/index.html', '<div id="root"></div>');
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Node runtime', () => {
  it('keeps unknown API paths in the BFF response format', async () => {
    const server = await startNodeRuntime(fakeDependencies(), {
      port: 0,
      assetsDirectory: await createAssetsDirectory(),
    });

    try {
      const response = await fetch(`${server.url}/api/unknown`);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'NOT_FOUND' },
      });
    } finally {
      await server.stop();
    }
  });

  it('serves the SPA document for client deep links', async () => {
    const server = await startNodeRuntime(fakeDependencies(), {
      port: 0,
      assetsDirectory: await createAssetsDirectory(),
    });

    try {
      await expect(
        fetch(`${server.url}/a/client/route`).then((response) =>
          response.text(),
        ),
      ).resolves.toContain('<div id="root">');
    } finally {
      await server.stop();
    }
  });
});
