import { PRODUCT_MARKET_TIMEZONES as CATALOG_TIMEZONES } from './product-markets';
import {
  getExchangeCatalogEntry,
  resolveExchangeTimezone,
  suggestMarket,
} from './exchange-catalog';
import { marketFromExchange } from './market-codes';

/** Built-in product-market → IANA fallbacks when public market config is missing. */
export const PRODUCT_MARKET_TIMEZONES: Record<string, string> = {
  ...CATALOG_TIMEZONES,
};

/**
 * Curated IANA zones for account/admin pickers (trading hubs + major regions).
 * Order is display order in selects.
 */
export const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Zurich',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
] as const;

export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function timezoneShortOffset(zone: string, at = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(at)
      .find((entry) => entry.type === 'timeZoneName')?.value;
    return part || 'GMT';
  } catch {
    return 'GMT';
  }
}

function timezoneCityLabel(zone: string): string {
  if (zone === 'UTC' || zone === 'Etc/UTC') return 'UTC';
  const leaf = zone.split('/').pop() ?? zone;
  return leaf.replace(/_/gu, ' ');
}

/** Human label for an IANA zone, e.g. `Shanghai (Asia/Shanghai) · GMT+8`. */
export function formatTimezoneOptionLabel(zone: string, at = new Date()): string {
  const city = timezoneCityLabel(zone);
  const offset = timezoneShortOffset(zone, at);
  if (zone === 'UTC' || zone === 'Etc/UTC') {
    return `UTC · ${offset}`;
  }
  return `${city} (${zone}) · ${offset}`;
}

/**
 * Options for timezone selects. Always includes `extra` (current value) and
 * the browser zone when valid, even if outside the curated list.
 */
export function listTimezoneSelectOptions(
  extra?: string | null,
): Array<[value: string, label: string]> {
  const seen = new Set<string>();
  const values: string[] = [];
  const push = (zone?: string | null) => {
    if (!zone || seen.has(zone) || !isValidTimezone(zone)) return;
    seen.add(zone);
    values.push(zone);
  };

  for (const zone of COMMON_TIMEZONES) push(zone);
  push(extra);
  push(guessBrowserTimezone());

  return values.map((zone) => [zone, formatTimezoneOptionLabel(zone)]);
}

/** Browser IANA timezone, or UTC when unavailable. */
export function guessBrowserTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimezone(zone) ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

export type MarketTimezoneSource = {
  code: string;
  timezone: string | null;
};

/**
 * Resolve the session/calendar timezone for a market code (US/HK/CN).
 * Prefers built-in catalog, then fallback.
 */
export function resolveMarketTimezone(
  marketCode: string | null | undefined,
  _markets?: MarketTimezoneSource[] | null | undefined,
  fallback?: string | null,
): string {
  const code = marketCode?.trim().toUpperCase();
  if (code) {
    const builtin = PRODUCT_MARKET_TIMEZONES[code];
    if (builtin) return builtin;
  }
  if (fallback && isValidTimezone(fallback)) return fallback;
  return guessBrowserTimezone();
}

/** Resolve timezone for an exchange using catalog country / market mapping. */
export function resolveTimezoneForExchange(
  exchange: string | null | undefined,
  fallback?: string | null,
): string {
  if (!exchange) {
    return fallback && isValidTimezone(fallback)
      ? fallback
      : guessBrowserTimezone();
  }
  const catalog = getExchangeCatalogEntry(exchange);
  const market =
    suggestMarket(catalog?.country, { group: catalog?.group }) ||
    marketFromExchange(exchange);
  const zone = resolveExchangeTimezone({
    market,
    country: catalog?.country,
    fallback:
      fallback && isValidTimezone(fallback) ? fallback : guessBrowserTimezone(),
  });
  return isValidTimezone(zone) ? zone : guessBrowserTimezone();
}
