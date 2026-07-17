import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export function resolveMigrationsFolder(
  cwd: string = process.cwd(),
  override = process.env.DRIZZLE_MIGRATIONS_FOLDER,
): string {
  const custom = override?.trim();
  if (custom) {
    return resolve(custom);
  }
  return resolve(cwd, 'drizzle');
}

export async function migrateDatabase(
  connectionString: string,
  migrationsFolder: string = resolveMigrationsFolder(),
): Promise<void> {
  const pool = new Pool({ connectionString });
  const database = drizzle(pool);

  try {
    await migrate(database, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
