import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import {
  createRepositories,
  type AnalysisJobsRepository,
  type ModelPricesRepository,
  type PricingSourcesRepository,
} from './repositories';
import * as schema from './schema';

export type DatabaseHealth = {
  healthcheck(): Promise<void>;
  analysisJobs: AnalysisJobsRepository;
  modelPrices: ModelPricesRepository;
  pricingSources: PricingSourcesRepository;
};

function createDatabase(connectionString: string): DatabaseHealth {
  const pool = new Pool({ connectionString });
  const database = drizzle({ client: pool, schema });
  const repositories = createRepositories(database);

  return {
    async healthcheck() {
      await database.execute(sql`SELECT 1`);
    },
    ...repositories,
  };
}

export function createNodeDatabase(databaseUrl: string | URL): DatabaseHealth {
  return createDatabase(databaseUrl.toString());
}

export function createWorkerDatabase(connectionString: string): DatabaseHealth {
  return createDatabase(connectionString);
}
