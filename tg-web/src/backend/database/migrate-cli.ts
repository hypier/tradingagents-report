/**
 * `pnpm db:migrate` 的 CLI 入口。
 *
 * 加载 `tg-web/.env`（覆盖陈旧的 shell 导出），校验 DATABASE_URL，
 * 再通过 `migrateDatabase()` 应用 Drizzle 迁移。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { migrateDatabase, resolveMigrationsFolder } from './migrate';

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/** 加载 KEY=VALUE；可选是否覆盖已有 process.env。 */
export function loadEnvFile(path: string, { override = false } = {}): void {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (!override && process.env[key] !== undefined) continue;

    process.env[key] = stripQuotes(trimmed.slice(separator + 1).trim());
  }
}

/** 要求 DATABASE_URL 为包含凭据的 PostgreSQL 连接串。 */
export function databaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const urlValue = env.DATABASE_URL?.trim() || '';
  if (!urlValue) {
    throw new Error(
      'DATABASE_URL must be set (tg-web/.env or container env) to run migrations',
    );
  }

  const parsed = new URL(urlValue);
  if (!parsed.username || !parsed.password) {
    throw new Error(
      'DATABASE_URL must include username and password, e.g. postgresql://tradingagents:password@127.0.0.1:5432/tradingagents',
    );
  }

  return urlValue;
}

/** 迁移前优先加载 tg-web/.env，覆盖陈旧 shell 环境变量。 */
export function loadMigrationEnv(cwd: string = process.cwd()): void {
  loadEnvFile(resolve(cwd, '.env'), { override: true });
}

/** package.json `db:migrate` 使用的入口。 */
export async function runMigrations(): Promise<void> {
  loadMigrationEnv();
  const connectionString = databaseUrlFromEnv();
  const target = new URL(connectionString);
  console.log(
    `Migrating ${target.username}@${target.host}${target.pathname}`,
  );
  const migrationsFolder = resolveMigrationsFolder();
  await migrateDatabase(connectionString, migrationsFolder);
  console.log(`Applied Drizzle migrations from ${migrationsFolder}`);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void runMigrations().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
