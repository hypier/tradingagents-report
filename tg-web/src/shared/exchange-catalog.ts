import exchangesData from './exchanges.json';
import {
  PRODUCT_MARKET_TIMEZONES,
  isProductMarketCode,
} from './product-markets';

export type ExchangeCatalogEntry = {
  name: string;
  value: string;
  desc: string;
  flag: string;
  group: string;
  country: string;
  provider_id: string;
  hidden?: boolean;
};

type ExchangesFile = {
  totalExchanges: number;
  exchanges: ExchangeCatalogEntry[];
};

const DATA = exchangesData as ExchangesFile;

/** Prefer a non-hidden row when TradingView lists the same `value` twice. */
const BY_VALUE = new Map<string, ExchangeCatalogEntry>();
for (const entry of DATA.exchanges) {
  const key = entry.value.trim().toUpperCase();
  const existing = BY_VALUE.get(key);
  if (!existing || (existing.hidden && !entry.hidden)) {
    BY_VALUE.set(key, entry);
  }
}

/** Continent-style groups are equity / stock venues in this catalog. */
export const EQUITY_CATALOG_GROUPS = [
  'North America',
  'Europe',
  'Asia / Pacific',
  'Middle East / Africa',
  'Mexico and South America',
] as const;

const EQUITY_GROUP_SET = new Set<string>(EQUITY_CATALOG_GROUPS);

const GROUP_SORT_ORDER = [
  ...EQUITY_CATALOG_GROUPS,
  'Cryptocurrency',
  'Forex',
  'Economy',
] as const;

function groupSortKey(group: string): number {
  const index = (GROUP_SORT_ORDER as readonly string[]).indexOf(group);
  return index >= 0 ? index : GROUP_SORT_ORDER.length;
}

export function isEquityCatalogGroup(group: string | null | undefined): boolean {
  if (!group) return false;
  return EQUITY_GROUP_SET.has(group);
}

/** First-party seed: technically analyzable today and present in exchanges.json. */
export const DEFAULT_ANALYSIS_EXCHANGE_SEEDS = [
  'NASDAQ',
  'NYSE',
  'AMEX',
  'OTC',
  'HKEX',
  'SSE',
  'SZSE',
  'TSE',
  'TWSE',
  'TPEX',
] as const;

const COUNTRY_TO_TIMEZONE: Record<string, string> = {
  us: 'America/New_York',
  hk: 'Asia/Hong_Kong',
  cn: 'Asia/Shanghai',
  jp: 'Asia/Tokyo',
  tw: 'Asia/Taipei',
  kr: 'Asia/Seoul',
  sg: 'Asia/Singapore',
  au: 'Australia/Sydney',
  gb: 'Europe/London',
  uk: 'Europe/London',
  de: 'Europe/Berlin',
  eu: 'Europe/Berlin',
  ca: 'America/Toronto',
  in: 'Asia/Kolkata',
};

export function listExchangeCatalog(options?: {
  includeHidden?: boolean;
}): ExchangeCatalogEntry[] {
  const includeHidden = options?.includeHidden === true;
  const byValue = new Map<string, ExchangeCatalogEntry>();
  for (const entry of DATA.exchanges) {
    if (!includeHidden && entry.hidden) continue;
    const key = entry.value.trim().toUpperCase();
    const existing = byValue.get(key);
    if (!existing || (existing.hidden && !entry.hidden)) {
      byValue.set(key, entry);
    }
  }
  return [...byValue.values()].sort((a, b) => {
    const group = groupSortKey(a.group) - groupSortKey(b.group);
    if (group !== 0) return group;
    const groupName = a.group.localeCompare(b.group);
    if (groupName !== 0) return groupName;
    return a.name.localeCompare(b.name);
  });
}

/** Unique `group` values in catalog display order. */
export function listCatalogGroups(options?: {
  includeHidden?: boolean;
}): string[] {
  const groups = new Set(
    listExchangeCatalog(options).map((entry) => entry.group),
  );
  return [...groups].sort((a, b) => {
    const order = groupSortKey(a) - groupSortKey(b);
    return order !== 0 ? order : a.localeCompare(b);
  });
}

export function getExchangeCatalogEntry(
  code: string | null | undefined,
): ExchangeCatalogEntry | undefined {
  if (!code) return undefined;
  return BY_VALUE.get(code.trim().toUpperCase());
}

/**
 * Derive account/default market from catalog country (uppercase), or CRYPTO
 * when the exchange has no country and belongs to the Cryptocurrency group.
 */
export function suggestMarket(
  country: string | null | undefined,
  options?: { group?: string | null },
): string | null {
  if (country?.trim()) {
    return country.trim().toUpperCase();
  }
  const group = options?.group?.trim().toLowerCase() ?? '';
  if (group.includes('crypto')) {
    return 'CRYPTO';
  }
  return null;
}

/** Unique market codes present in the exchange catalog (country + CRYPTO). */
export function listCatalogMarketCodes(): string[] {
  const markets = new Set<string>();
  for (const entry of DATA.exchanges) {
    const market = suggestMarket(entry.country, { group: entry.group });
    if (market) markets.add(market);
  }
  return [...markets].sort((a, b) => a.localeCompare(b));
}

export function timezoneForMarket(
  market: string | null | undefined,
): string | null {
  if (!market) return null;
  const code = market.trim().toUpperCase();
  if (isProductMarketCode(code)) {
    return PRODUCT_MARKET_TIMEZONES[code];
  }
  return COUNTRY_TO_TIMEZONE[code.toLowerCase()] ?? null;
}

export function timezoneForCountry(
  country: string | null | undefined,
): string | null {
  if (!country) return null;
  return COUNTRY_TO_TIMEZONE[country.trim().toLowerCase()] ?? null;
}

export function resolveExchangeTimezone(input: {
  market?: string | null;
  country?: string | null;
  fallback?: string | null;
}): string {
  return (
    timezoneForMarket(input.market) ||
    timezoneForCountry(input.country) ||
    (input.fallback?.trim() || '') ||
    'UTC'
  );
}

export function defaultDisplayNameForExchange(code: string): string {
  const entry = getExchangeCatalogEntry(code);
  return entry?.name || entry?.desc || code.trim().toUpperCase();
}

/** TradingView exchange source logo. */
export function exchangeLogoUrl(code: string | null | undefined): string | null {
  const value = code?.trim();
  if (!value) return null;
  return `https://tv-logo.tradingviewapi.com/logo/source/${encodeURIComponent(value)}.svg`;
}

/** Catalog exchange codes whose derived market matches (e.g. US → NASDAQ, NYSE…). */
export function exchangesForMarket(market: string | null | undefined): string[] {
  if (!market?.trim()) return [];
  const code = market.trim().toUpperCase();
  return DATA.exchanges
    .filter((entry) => {
      if (entry.hidden) return false;
      return suggestMarket(entry.country, { group: entry.group }) === code;
    })
    .map((entry) => entry.value.trim().toUpperCase());
}
