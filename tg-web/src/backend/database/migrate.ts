/**
 * 可编程的 Drizzle 迁移执行器。
 *
 * 解析迁移目录（默认 `./drizzle`，可用 `DRIZZLE_MIGRATIONS_FOLDER` 覆盖），
 * 并应用尚未执行的 SQL 迁移。
 */
import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/** 解析 Drizzle 生成的迁移 SQL 所在目录。 */
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

/** 打开短生命周期连接池，执行迁移后关闭。 */
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
