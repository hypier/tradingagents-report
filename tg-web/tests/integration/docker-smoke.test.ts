import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const image = 'tg-web:smoke';
const container = 'tg-web-smoke';
const port = process.env.DOCKER_SMOKE_PORT ?? '18877';
const dockerSmoke = process.env.DOCKER_SMOKE === '1' ? describe : describe.skip;

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The detached container may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Docker container did not become healthy: ${url}`);
}

dockerSmoke('Docker image', () => {
  beforeAll(async () => {
    await execFileAsync('docker', ['build', '--tag', image, '.']);
    await execFileAsync('docker', [
      'run',
      '--detach',
      '--rm',
      '--name',
      container,
      '--publish',
      `127.0.0.1:${port}:8787`,
      '--env',
      'PORT=8787',
      '--env',
      'DATABASE_URL=postgresql://host.docker.internal:5432/tg_web',
      '--env',
      'CORE_API_URL=http://host.docker.internal:9999',
      '--env',
      'CORE_API_KEY=test-key',
      '--env',
      'REDIS_URL=redis://host.docker.internal:6379',
      image,
    ]);
    await waitForHealth(`http://127.0.0.1:${port}/api/health`);
  });

  afterAll(async () => {
    await execFileAsync('docker', ['rm', '--force', container]).catch(
      () => undefined,
    );
  });

  it('serves health JSON without connecting to dependencies', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);

    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      data: { status: 'ok' },
    });
  });

  it('serves the SPA document', async () => {
    await expect(
      fetch(`http://127.0.0.1:${port}/`).then((response) => response.text()),
    ).resolves.toContain('<div id="root">');
  });
});
