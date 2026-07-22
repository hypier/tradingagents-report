type FetchImplementation = typeof fetch;

export type PublicExchange = {
  exchange: string;
  displayName: string;
  market: string | null;
};

export type PublicConfig = {
  clerkPublishableKey: string;
  maintenance: {
    enabled: boolean;
    message: { en: string; zh: string };
  };
  features: {
    watchlist: boolean;
  };
  exchanges: PublicExchange[];
  disclaimerMarkdown: { en: string | null; zh: string | null };
};

const defaultPublicConfig = (
  clerkPublishableKey: string,
): PublicConfig => ({
  clerkPublishableKey,
  maintenance: { enabled: false, message: { en: '', zh: '' } },
  features: { watchlist: true },
  exchanges: [],
  disclaimerMarkdown: { en: null, zh: null },
});

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function parsePublicConfig(data: Record<string, unknown>): PublicConfig | null {
  const key = data.clerkPublishableKey;
  if (typeof key !== 'string' || !key.trim()) {
    return null;
  }
  const base = defaultPublicConfig(key.trim());
  const maintenance = asRecord(data.maintenance);
  const message = asRecord(maintenance.message);
  const features = asRecord(data.features);
  const disclaimerMarkdown = asRecord(data.disclaimerMarkdown);

  return {
    ...base,
    maintenance: {
      enabled: Boolean(maintenance.enabled),
      message: {
        en: typeof message.en === 'string' ? message.en : '',
        zh: typeof message.zh === 'string' ? message.zh : '',
      },
    },
    features: {
      watchlist: features.watchlist !== false,
    },
    exchanges: Array.isArray(data.exchanges)
      ? data.exchanges.flatMap((row) => {
          const item = asRecord(row);
          if (typeof item.exchange !== 'string' || !item.exchange.trim()) {
            return [];
          }
          return [
            {
              exchange: item.exchange.trim().toUpperCase(),
              displayName:
                typeof item.displayName === 'string'
                  ? item.displayName
                  : item.exchange,
              market:
                typeof item.market === 'string' && item.market.trim()
                  ? item.market.trim().toUpperCase()
                  : null,
            },
          ];
        })
      : [],
    disclaimerMarkdown: {
      en:
        typeof disclaimerMarkdown.en === 'string'
          ? disclaimerMarkdown.en
          : null,
      zh:
        typeof disclaimerMarkdown.zh === 'string'
          ? disclaimerMarkdown.zh
          : null,
    },
  };
}

export async function fetchPublicConfig(
  fetchImplementation: FetchImplementation = fetch,
): Promise<PublicConfig | null> {
  try {
    const response = await fetchImplementation('/api/public-config');
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { data?: unknown };
    if (!body.data || typeof body.data !== 'object') {
      return null;
    }
    return parsePublicConfig(body.data as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Prefer runtime BFF config; fall back to Vite build-time env for local dev. */
export async function resolveClerkPublishableKey(
  vitePublishableKey?: string,
  fetchImplementation: FetchImplementation = fetch,
): Promise<string | null> {
  const runtime = await fetchPublicConfig(fetchImplementation);
  const key = runtime?.clerkPublishableKey || vitePublishableKey?.trim();
  return key || null;
}

export function enabledExchangeSet(
  exchanges: PublicExchange[] | null | undefined,
): Set<string> {
  return new Set(
    (exchanges ?? []).map((row) => row.exchange.trim().toUpperCase()),
  );
}

export function marketsFromEnabledExchanges(
  exchanges: PublicExchange[] | null | undefined,
): Array<{ code: string; displayName: string }> {
  const byMarket = new Map<string, string>();
  for (const row of exchanges ?? []) {
    const market = row.market?.trim().toUpperCase();
    if (!market || byMarket.has(market)) continue;
    byMarket.set(market, market);
  }
  return [...byMarket.entries()].map(([code]) => ({
    code,
    displayName: code,
  }));
}
