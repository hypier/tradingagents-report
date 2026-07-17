/** Client-side listing helpers aligned with tg-core `listings.py`.
 * Used after TradingView search selection — no Core HTTP call required.
 */

const EXCHANGE_TO_SUFFIX: Record<string, string> = {
  HKEX: '.HK',
  SSE: '.SS',
  SZSE: '.SZ',
  TSE: '.T',
  TWSE: '.TW',
  TPEX: '.TWO',
};

const EXCHANGE_ALIASES: Record<string, string> = {
  SHE: 'SZSE',
  SHA: 'SSE',
  TYO: 'TSE',
  JPX: 'TSE',
  ROCO: 'TPEX',
};

const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX']);

const SUFFIX_TO_EXCHANGE: Record<string, string> = {
  '.HK': 'HKEX',
  '.SS': 'SSE',
  '.SZ': 'SZSE',
  '.T': 'TSE',
  '.TW': 'TWSE',
  '.TWO': 'TPEX',
};

const KNOWN_SUFFIXES = ['.TWO', '.HK', '.SS', '.SZ', '.TW', '.T'] as const;

export type ResolvedListing = {
  ticker: string;
  exchange: string | null;
  symbol: string;
  display_ticker: string;
  provider_symbol: string | null;
};

export type MarketSearchHit = ResolvedListing & {
  display_name: string;
  logo_url?: string;
  is_primary_listing?: boolean;
};

export interface ListingResolver {
  resolveListing(ticker: string): Promise<ResolvedListing>;
}

export function normalizeExchange(exchange: string): string {
  const value = exchange.trim().toUpperCase();
  return EXCHANGE_ALIASES[value] ?? value;
}

export function isSupportedExchange(exchange: string): boolean {
  const normalized = normalizeExchange(exchange);
  return normalized in EXCHANGE_TO_SUFFIX || US_EXCHANGES.has(normalized);
}

/** Build a listing from a confirmed exchange + symbol (e.g. TV selection). */
export function listingFromParts(
  exchange: string,
  symbol: string,
): ResolvedListing {
  const normalizedExchange = normalizeExchange(exchange);
  let normalizedSymbol = symbol.trim().toUpperCase();

  if (normalizedExchange === 'HKEX') {
    if (!/^\d+$/u.test(normalizedSymbol)) {
      throw new Error('HKEX symbols must be numeric');
    }
    normalizedSymbol = String(Number(normalizedSymbol));
  }

  let displayTicker: string;
  if (normalizedExchange === 'HKEX') {
    displayTicker = `${Number(normalizedSymbol).toString().padStart(4, '0')}.HK`;
  } else if (normalizedExchange in EXCHANGE_TO_SUFFIX) {
    displayTicker = `${normalizedSymbol}${EXCHANGE_TO_SUFFIX[normalizedExchange]}`;
  } else if (US_EXCHANGES.has(normalizedExchange)) {
    displayTicker = normalizedSymbol;
  } else {
    throw new Error(`unsupported exchange: ${normalizedExchange}`);
  }

  return {
    ticker: displayTicker,
    exchange: normalizedExchange,
    symbol: normalizedSymbol,
    display_ticker: displayTicker,
    provider_symbol: `${normalizedExchange}:${normalizedSymbol}`,
  };
}

/** Parse TradingView `EXCHANGE:SYMBOL` into a listing. */
export function listingFromProviderSymbol(providerSymbol: string): ResolvedListing {
  const value = providerSymbol.trim().toUpperCase();
  const [exchange, symbol] = value.split(':', 2);
  if (!exchange || !symbol) {
    throw new Error(`invalid provider symbol: ${providerSymbol}`);
  }
  return listingFromParts(exchange, symbol);
}

/** Deterministic parse of Yahoo / EXCHANGE:SYMBOL tickers (no network). */
export function resolveListingTicker(ticker: string): ResolvedListing {
  const value = ticker.trim().toUpperCase();
  if (!value) {
    throw new Error('ticker is required');
  }

  if (value.includes(':')) {
    return listingFromProviderSymbol(value);
  }

  for (const suffix of KNOWN_SUFFIXES) {
    if (!value.endsWith(suffix)) continue;
    const exchange = SUFFIX_TO_EXCHANGE[suffix];
    const rawSymbol = value.slice(0, -suffix.length);
    return listingFromParts(exchange, rawSymbol);
  }

  return {
    ticker: value,
    exchange: null,
    symbol: value,
    display_ticker: value,
    provider_symbol: null,
  };
}

export function formatDisplayTicker(
  ticker: string,
  resolvedDisplayTicker?: string | null,
): string {
  const value = (resolvedDisplayTicker ?? ticker).trim();
  return value ? value.toUpperCase() : '';
}
