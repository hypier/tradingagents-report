import { readFile } from 'node:fs/promises';

import { expect, it } from 'vitest';

it('requires a Node version supported by frontend test dependencies', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { engines: { node: string }; packageManager?: string };

  expect(packageJson.engines.node).toBe('>=20.19.0');
  expect(packageJson.packageManager).toBe('pnpm@10.10.0');
});
