import { readFile } from 'node:fs/promises';

import { expect, it } from 'vitest';

it('requires a Node version supported by frontend test dependencies', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { engines: { node: string }; packageManager?: string };

  expect(packageJson.engines.node).toBe('>=20.19.0');
  expect(packageJson.packageManager).toBe('pnpm@10.10.0');
});

it('initializes and loads the local environment before starting the Node API', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { scripts: Record<string, string> };

  expect(packageJson.scripts['ensure:env']).toBe(
    'test -f .env || cp .env.example .env',
  );
  expect(packageJson.scripts.predev).toBe('pnpm ensure:env');
  expect(packageJson.scripts['predev:api']).toBe('pnpm ensure:env');
  expect(packageJson.scripts['dev:api']).toBe(
    'tsx watch --env-file=.env src/runtimes/node.ts',
  );
});
