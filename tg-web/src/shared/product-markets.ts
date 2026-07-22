/**
 * Canonical product-market catalog.
 *
 * Must stay in sync with `market_configs` seed rows
 * (`drizzle/0003_p3_product_ops.sql` insert + later renames/simplifications).
 * Runtime truth is the `market_configs` table; this module is the
 * typed fallback / validation source used when DB rows are unavailable.
 */
export const PRODUCT_MARKET_CODES = ['US', 'HK', 'CN', 'CRYPTO'] as const;

export type ProductMarketCode = (typeof PRODUCT_MARKET_CODES)[number];

export type ProductMarketDefinition = {
  code: ProductMarketCode;
  displayName: string;
  timezone: string;
  enabled: boolean;
};

export const PRODUCT_MARKET_CATALOG: readonly ProductMarketDefinition[] = [
  {
    code: 'US',
    displayName: 'United States',
    timezone: 'America/New_York',
    enabled: true,
  },
  {
    code: 'HK',
    displayName: 'Hong Kong',
    timezone: 'Asia/Hong_Kong',
    enabled: true,
  },
  {
    code: 'CN',
    displayName: 'China A-shares',
    timezone: 'Asia/Shanghai',
    enabled: true,
  },
  {
    code: 'CRYPTO',
    displayName: 'Crypto',
    timezone: 'UTC',
    enabled: true,
  },
] as const;

export const PRODUCT_MARKET_TIMEZONES: Record<ProductMarketCode, string> =
  Object.fromEntries(
    PRODUCT_MARKET_CATALOG.map((row) => [row.code, row.timezone]),
  ) as Record<ProductMarketCode, string>;

export function isProductMarketCode(
  value: string | null | undefined,
): value is ProductMarketCode {
  if (!value) return false;
  return (PRODUCT_MARKET_CODES as readonly string[]).includes(
    value.trim().toUpperCase(),
  );
}

export function normalizeProductMarketCode(
  value: string | null | undefined,
): ProductMarketCode | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return isProductMarketCode(code) ? code : null;
}
