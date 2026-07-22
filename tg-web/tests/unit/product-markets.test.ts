import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PRODUCT_MARKET_CATALOG,
  PRODUCT_MARKET_CODES,
  isProductMarketCode,
} from '../../src/shared/product-markets';

describe('product markets catalog', () => {
  it('exposes the canonical operable market codes', () => {
    expect([...PRODUCT_MARKET_CODES]).toEqual(['US', 'HK', 'CN', 'CRYPTO']);
    expect(PRODUCT_MARKET_CATALOG.map((row) => row.code)).toEqual([
      ...PRODUCT_MARKET_CODES,
    ]);
    expect(isProductMarketCode('us')).toBe(true);
    expect(isProductMarketCode('XYZ')).toBe(false);
  });

  it('matches the historical market_configs seed payload', () => {
    const seedSql = readFileSync(
      resolve(__dirname, '../../drizzle/0003_p3_product_ops.sql'),
      'utf8',
    );
    for (const row of PRODUCT_MARKET_CATALOG) {
      expect(seedSql).toContain(`('${row.code}',`);
      expect(seedSql).toContain(row.displayName);
      expect(seedSql).toContain(row.timezone);
      expect(seedSql).toContain(row.currency);
    }
  });
});
