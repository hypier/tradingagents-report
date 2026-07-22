/**
 * Canonical product-market catalog.
 *
 * Must stay in sync with `market_configs` seed rows
 * (`drizzle/0003_p3_product_ops.sql` insert + later renames).
 * Runtime truth is the `market_configs` table; this module is the
 * typed fallback / validation source used when DB rows are unavailable.
 */
export const PRODUCT_MARKET_CODES = ['US', 'HK', 'CN', 'CRYPTO'] as const;

export type ProductMarketCode = (typeof PRODUCT_MARKET_CODES)[number];

export type ProductMarketDefinition = {
  code: ProductMarketCode;
  displayName: string;
  timezone: string;
  currency: string;
  sessionNotes: string;
  disclaimer: string | null;
  sortOrder: number;
  enabled: boolean;
};

export const PRODUCT_MARKET_CATALOG: readonly ProductMarketDefinition[] = [
  {
    code: 'US',
    displayName: 'United States',
    timezone: 'America/New_York',
    currency: 'USD',
    sessionNotes: 'Regular session 09:30–16:00 ET',
    disclaimer: null,
    sortOrder: 10,
    enabled: true,
  },
  {
    code: 'HK',
    displayName: 'Hong Kong',
    timezone: 'Asia/Hong_Kong',
    currency: 'HKD',
    sessionNotes: 'Regular session 09:30–16:00 HKT',
    disclaimer: null,
    sortOrder: 20,
    enabled: true,
  },
  {
    code: 'CN',
    displayName: 'China A-shares',
    timezone: 'Asia/Shanghai',
    currency: 'CNY',
    sessionNotes: 'Regular session 09:30–15:00 CST',
    disclaimer: null,
    sortOrder: 30,
    enabled: true,
  },
  {
    code: 'CRYPTO',
    displayName: 'Crypto',
    timezone: 'UTC',
    currency: 'USD',
    sessionNotes: '24/7 trading',
    disclaimer: null,
    sortOrder: 40,
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
