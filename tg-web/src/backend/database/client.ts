/**
 * Node / Worker 运行时的数据库客户端工厂。
 *
 * 创建 Drizzle 连接池，挂载 `createRepositories()` 返回的仓库，
 * 并暴露 readiness 探针使用的 healthcheck。
 */
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import {
  createRepositories,
  type AccountRepository,
  type AnalysisJobsRepository,
  type AdminAuditRepository,
  type BillingRepository,
  type MarketsRepository,
  type LlmCatalogRepository,
  type SystemSettingsRepository,
  type ReferralRepository,
  type WatchlistRepository,
} from './repositories';
import * as schema from './schema';

/** BFF 可用的共享表面（健康检查 + 全部仓库）。 */
export type DatabaseHealth = {
  healthcheck(): Promise<void>;
  analysisJobs: AnalysisJobsRepository;
  llmCatalog: LlmCatalogRepository;
  account: AccountRepository;
  billing: BillingRepository;
  referrals: ReferralRepository;
  watchlist: WatchlistRepository;
  settings: SystemSettingsRepository;
  markets: MarketsRepository;
  audit: AdminAuditRepository;
};

/** Node 运行时额外提供进程退出时关闭连接池的能力。 */
export type NodeDatabase = DatabaseHealth & {
  close(): Promise<void>;
};

function createDatabase(connectionString: string): NodeDatabase {
  const pool = new Pool({ connectionString });
  const database = drizzle({ client: pool, schema });
  const repositories = createRepositories(database);

  return {
    async healthcheck() {
      await database.execute(sql`SELECT 1`);
    },
    close() {
      return pool.end();
    },
    ...repositories,
  };
}

/** 由 DATABASE_URL（字符串或 URL）创建 Node.js 数据库句柄。 */
export function createNodeDatabase(databaseUrl: string | URL): NodeDatabase {
  return createDatabase(databaseUrl.toString());
}

/** 为 Worker / edge 入口创建相同的仓库表面。 */
export function createWorkerDatabase(connectionString: string): DatabaseHealth {
  return createDatabase(connectionString);
}
