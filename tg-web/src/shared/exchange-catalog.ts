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

const BY_VALUE = new Map(
  DATA.exchanges.map((entry) => [entry.value.trim().toUpperCase(), entry]),
);

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
  return DATA.exchanges
    .filter((entry) => includeHidden || !entry.hidden)
    .slice()
    .sort((a, b) => {
      const group = a.group.localeCompare(b.group);
      if (group !== 0) return group;
      return a.name.localeCompare(b.name);
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
