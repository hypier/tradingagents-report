import { describe, expect, it } from 'vitest';

import { resolveMigrationsFolder } from '../../src/backend/database/migrate';

describe('Drizzle migrations', () => {
  it('resolves the migrations folder from the package root by default', () => {
    expect(resolveMigrationsFolder('/tmp/tg-web')).toBe('/tmp/tg-web/drizzle');
  });

  it('allows overriding the migrations folder', () => {
    expect(
      resolveMigrationsFolder('/tmp/tg-web', '/custom/migrations'),
    ).toBe('/custom/migrations');
  });
});
