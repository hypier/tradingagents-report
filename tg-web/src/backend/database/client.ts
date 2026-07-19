import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import {
  createRepositories,
  type AnalysisJobsRepository,
  type BillingConfigRepository,
  type ModelPricesRepository,
  type ProductRepository,
  type PricingSourcesRepository,
} from './repositories';
import * as schema from './schema';

export type DatabaseHealth = {
  healthcheck(): Promise<void>;
  analysisJobs: AnalysisJobsRepository;
  modelPrices: ModelPricesRepository;
  pricingSources: PricingSourcesRepository;
  product: ProductRepository;
  billingConfig: BillingConfigRepository;
};

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

export function createNodeDatabase(databaseUrl: string | URL): NodeDatabase {
  return createDatabase(databaseUrl.toString());
}

export function createWorkerDatabase(connectionString: string): DatabaseHealth {
  return createDatabase(connectionString);
}
