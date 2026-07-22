type FetchImplementation = typeof fetch;

export type PublicMarket = {
  code: string;
  displayName: string;
  timezone: string | null;
  currency: string | null;
  sessionNotes: string | null;
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
  markets: PublicMarket[];
  disclaimerMarkdown: { en: string | null; zh: string | null };
};

const defaultPublicConfig = (
  clerkPublishableKey: string,
): PublicConfig => ({
  clerkPublishableKey,
  maintenance: { enabled: false, message: { en: '', zh: '' } },
  features: { watchlist: true },
  markets: [],
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
    markets: Array.isArray(data.markets)
      ? data.markets.flatMap((row) => {
          const item = asRecord(row);
          if (typeof item.code !== 'string' || !item.code.trim()) return [];
          return [
            {
              code: item.code,
              displayName:
                typeof item.displayName === 'string'
                  ? item.displayName
                  : item.code,
              timezone:
                typeof item.timezone === 'string' ? item.timezone : null,
              currency:
                typeof item.currency === 'string' ? item.currency : null,
              sessionNotes:
                typeof item.sessionNotes === 'string'
                  ? item.sessionNotes
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
