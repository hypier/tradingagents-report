import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  createMarketStreamToken,
  getMarketSnapshot,
  type MarketSnapshot,
} from '@/frontend/lib/research';
import { parseUpdateModeDelaySeconds } from '@/frontend/lib/snapshot-freshness';
import { resolveMarketCurrency } from '@/shared/listing';

export type QuoteStreamStatus = 'idle' | 'connecting' | 'live' | 'error';

export type SessionQuoteStats = {
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
};

type QuoteUpdatePayload = {
  type?: string;
  symbol?: string;
  data?: Record<string, unknown>;
  timestamp?: number;
};

function numberField(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function applyQuoteUpdate(
  previous: MarketSnapshot | null | undefined,
  payload: QuoteUpdatePayload,
): { patch: Partial<MarketSnapshot>; stats: SessionQuoteStats } | null {
  if (payload.type !== 'quote_update' || !payload.data) return null;
  const data = payload.data;
  const lastPrice = numberField(data, 'lp');
  const change = numberField(data, 'ch');
  const changePercent = numberField(data, 'chp');
  const updateMode = stringField(data, 'update_mode');
  const delaySeconds = parseUpdateModeDelaySeconds(updateMode);
  const lpTime = numberField(data, 'lp_time');
  const currencyCode = stringField(data, 'currency_code');

  return {
    patch: {
      ...(lastPrice !== undefined ? { last_price: lastPrice } : {}),
      ...(change !== undefined ? { change } : {}),
      ...(changePercent !== undefined ? { change_percent: changePercent } : {}),
      ...(updateMode ? { update_mode: updateMode } : {}),
      ...(delaySeconds !== null ? { delay_seconds: delaySeconds } : {}),
      ...(lpTime !== undefined
        ? { as_of: new Date(lpTime * 1_000).toISOString() }
        : {}),
      ...(currencyCode
        ? { currency: resolveMarketCurrency(currencyCode) }
        : {}),
      source: previous?.source ?? 'tradingview',
    },
    stats: {
      open: numberField(data, 'open_price'),
      high: numberField(data, 'high_price'),
      low: numberField(data, 'low_price'),
      volume: numberField(data, 'volume'),
    },
  };
}

/**
 * Snapshot for logo/identity + TradingView SSE quote updates via BFF JWT.
 * RapidAPI key never leaves the server; browser opens EventSource to sseUrl.
 */
export function useLiveQuote(providerSymbol: string) {
  const snapshot = useQuery({
    queryKey: ['market-snapshot', providerSymbol],
    queryFn: async () => {
      const response = await getMarketSnapshot(providerSymbol);
      return response.data;
    },
    enabled: Boolean(providerSymbol),
    staleTime: 30_000,
    retry: 1,
  });

  const [livePatch, setLivePatch] = useState<Partial<MarketSnapshot> | null>(
    null,
  );
  const [sessionStats, setSessionStats] = useState<SessionQuoteStats | null>(
    null,
  );
  const [streamStatus, setStreamStatus] = useState<QuoteStreamStatus>('idle');

  useEffect(() => {
    setLivePatch(null);
    setSessionStats(null);
    setStreamStatus('idle');
  }, [providerSymbol]);

  useEffect(() => {
    if (!providerSymbol) return;

    let cancelled = false;
    let source: EventSource | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const disconnect = () => {
      source?.close();
      source = null;
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      refreshTimer = undefined;
      retryTimer = undefined;
    };

    const connect = async () => {
      disconnect();
      if (cancelled) return;
      setStreamStatus('connecting');

      try {
        const { data } = await createMarketStreamToken();
        if (cancelled) return;

        const url = new URL(data.sseUrl);
        url.searchParams.set('token', data.token);
        url.searchParams.set('symbols', providerSymbol);
        url.searchParams.set('type', 'quote');

        source = new EventSource(url.toString());

        source.onmessage = (event) => {
          let payload: QuoteUpdatePayload;
          try {
            payload = JSON.parse(event.data) as QuoteUpdatePayload;
          } catch {
            return;
          }

          if (payload.type === 'connected') {
            setStreamStatus('live');
            return;
          }
          if (payload.type === 'error') {
            setStreamStatus('error');
            return;
          }

          const applied = applyQuoteUpdate(snapshot.data, payload);
          if (!applied) return;
          setLivePatch((previous) => ({ ...(previous ?? {}), ...applied.patch }));
          setSessionStats((previous) => ({
            ...(previous ?? {}),
            ...Object.fromEntries(
              Object.entries(applied.stats).filter(
                ([, value]) => value !== undefined,
              ),
            ),
          }));
          setStreamStatus('live');
        };

        source.onerror = () => {
          if (cancelled) return;
          setStreamStatus('error');
          source?.close();
          source = null;
          retryTimer = setTimeout(() => {
            void connect();
          }, 5_000);
        };

        const refreshInMs = Math.max(
          data.expiresAt - Date.now() - 60_000,
          30_000,
        );
        refreshTimer = setTimeout(() => {
          void connect();
        }, refreshInMs);
      } catch {
        if (cancelled) return;
        setStreamStatus('error');
        retryTimer = setTimeout(() => {
          void connect();
        }, 8_000);
      }
    };

    void connect();

    return () => {
      cancelled = true;
      disconnect();
    };
    // snapshot.data intentionally omitted — only used as identity fallback in apply
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnect only on symbol
  }, [providerSymbol]);

  const quote: MarketSnapshot | null | undefined = snapshot.data
    ? { ...snapshot.data, ...(livePatch ?? {}) }
    : livePatch
      ? ({
          ticker: providerSymbol,
          ...livePatch,
        } as MarketSnapshot)
      : undefined;

  const sessionStatsFromSnapshot: SessionQuoteStats | null = snapshot.data
    ? {
        open: snapshot.data.open,
        high: snapshot.data.high,
        low: snapshot.data.low,
        volume: snapshot.data.volume,
      }
    : null;

  const mergedStats: SessionQuoteStats | null =
    sessionStats || sessionStatsFromSnapshot
      ? {
          ...(sessionStatsFromSnapshot ?? {}),
          ...(sessionStats ?? {}),
        }
      : null;

  return {
    quote,
    sessionStats: mergedStats,
    streamStatus,
    loading: snapshot.isLoading && !quote,
    error: snapshot.isError && !quote,
  };
}
