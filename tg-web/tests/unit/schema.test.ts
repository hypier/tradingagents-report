import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  analysisJobs,
  llmModelPrices,
  llmPricingSources,
} from '../../src/backend/database/schema';

describe('Core table mappings', () => {
  it('maps the three Core-owned table names', () => {
    expect(getTableName(analysisJobs)).toBe('analysis_jobs');
    expect(getTableName(llmModelPrices)).toBe('llm_model_prices');
    expect(getTableName(llmPricingSources)).toBe('llm_pricing_sources');
  });
});
