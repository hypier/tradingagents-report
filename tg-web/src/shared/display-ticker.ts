/** Yahoo ↔ TradingView ticker helpers aligned with tg-core listings. */

const EXCHANGE_SUFFIX: Record<string, string> = {
  HKEX: '.HK',
  SSE: '.SS',
  SHA: '.SS',
  SZSE: '.SZ',
  SHE: '.SZ',
  TSE: '.T',
  TYO: '.T',
  JPX: '.T',
  TWSE: '.TW',
  TPEX: '.TWO',
  ROCO: '.TWO',
};

const SUFFIX_TO_EXCHANGE: Record<string, string> = {
  '.HK': 'HKEX',
  '.SS': 'SSE',
  '.SZ': 'SZSE',
  '.T': 'TSE',
  '.TW': 'TWSE',
  '.TWO': 'TPEX',
};

const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX']);

const KNOWN_SUFFIXES = ['.TWO', '.HK', '.SS', '.SZ', '.TW', '.T'] as const;

export type ListingParts = {
  exchange: string | null;
  symbol: string;
  displayTicker: string;
  /** TradingView `EXCHANGE:SYMBOL` when exchange is known. */
  tradingViewSymbol: string | null;
  /** Query token for TradingView market search. */
  searchQuery: string;
};

export function displayTickerFromListing(
  exchange: string,
  symbol: string,
): string {
  const normalizedExchange = exchange.trim().toUpperCase();
  const normalizedSymbol = symbol.trim().toUpperCase();

  if (normalizedExchange === 'HKEX') {
    if (!/^\d+$/u.test(normalizedSymbol)) return normalizedSymbol;
    return `${Number(normalizedSymbol).toString().padStart(4, '0')}.HK`;
  }

  if (normalizedExchange in EXCHANGE_SUFFIX) {
    if (KNOWN_SUFFIXES.some((suffix) => normalizedSymbol.endsWith(suffix))) {
      return normalizedSymbol;
    }
    return `${normalizedSymbol}${EXCHANGE_SUFFIX[normalizedExchange]}`;
  }

  if (US_EXCHANGES.has(normalizedExchange)) {
    return normalizedSymbol.replace(/\.(HK|SS|SZ|T|TW|TWO)$/u, '');
  }

  return normalizedSymbol;
}

export function parseListingTicker(ticker: string): ListingParts {
  const value = ticker.trim().toUpperCase();
  if (!value) {
    return {
      exchange: null,
      symbol: '',
      displayTicker: '',
      tradingViewSymbol: null,
      searchQuery: '',
    };
  }

  if (value.includes(':')) {
    const [exchange, symbol] = value.split(':', 2);
    if (exchange && symbol) {
      const normalizedSymbol =
        exchange === 'HKEX' && /^\d+$/u.test(symbol)
          ? String(Number(symbol))
          : symbol;
      return {
        exchange,
        symbol: normalizedSymbol,
        displayTicker: displayTickerFromListing(exchange, normalizedSymbol),
        tradingViewSymbol: `${exchange}:${normalizedSymbol}`,
        searchQuery: normalizedSymbol,
      };
    }
  }

  for (const suffix of KNOWN_SUFFIXES) {
    if (!value.endsWith(suffix)) continue;
    const exchange = SUFFIX_TO_EXCHANGE[suffix];
    const rawSymbol = value.slice(0, -suffix.length);
    const symbol =
      exchange === 'HKEX' && /^\d+$/u.test(rawSymbol)
        ? String(Number(rawSymbol))
        : rawSymbol;
    return {
      exchange,
      symbol,
      displayTicker: displayTickerFromListing(exchange, symbol),
      tradingViewSymbol: `${exchange}:${symbol}`,
      searchQuery: symbol,
    };
  }

  return {
    exchange: null,
    symbol: value,
    displayTicker: value,
    tradingViewSymbol: null,
    searchQuery: value,
  };
}

/** Prefer TradingView full_name like `HKEX:700`, else normalize a raw ticker. */
export function formatDisplayTicker(
  ticker: string,
  fullName?: string | null,
): string {
  if (fullName?.includes(':')) {
    return parseListingTicker(fullName).displayTicker;
  }
  return parseListingTicker(ticker).displayTicker;
}

/** Convert Yahoo / bare tickers into TradingView `EXCHANGE:SYMBOL` when possible. */
export function toTradingViewSymbol(ticker: string): string | null {
  return parseListingTicker(ticker).tradingViewSymbol;
}
