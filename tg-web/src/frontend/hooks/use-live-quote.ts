import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

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

/** UI paint cadence for SSE ticks — keeps last payload, drops intermediates. */
const LIVE_UI_MIN_INTERVAL_MS = 250;

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
 * Snapshot + stream token are cached; SSE paints are throttled.
 */
export function useLiveQuote(providerSymbol: string) {
  const queryClient = useQueryClient();
  const snapshot = useQuery({
    queryKey: ['market-snapshot', providerSymbol],
    queryFn: async () => {
      const response = await getMarketSnapshot(providerSymbol);
      return response.data;
    },
    enabled: Boolean(providerSymbol),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const streamToken = useQuery({
    queryKey: ['market-stream-token'],
    queryFn: async () => {
      const response = await createMarketStreamToken();
      return response.data;
    },
    enabled: Boolean(providerSymbol),
    // Token TTL is ~30m; refresh a few minutes early via staleTime.
    staleTime: 20 * 60_000,
    gcTime: 25 * 60_000,
    retry: 1,
  });

  const [livePatch, setLivePatch] = useState<Partial<MarketSnapshot> | null>(
    null,
  );
  const [sessionStats, setSessionStats] = useState<SessionQuoteStats | null>(
    null,
  );
  const [streamStatus, setStreamStatus] = useState<QuoteStreamStatus>('idle');
  const [refreshing, setRefreshing] = useState(false);
  const pendingRef = useRef<{
    patch: Partial<MarketSnapshot>;
    stats: SessionQuoteStats;
  } | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastFlushAtRef = useRef(0);

  useEffect(() => {
    setLivePatch(null);
    setSessionStats(null);
    setStreamStatus('idle');
    pendingRef.current = null;
    if (flushTimerRef.current !== undefined) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
  }, [providerSymbol]);

  useEffect(() => {
    if (!providerSymbol || !streamToken.data) return;

    let cancelled = false;
    let source: EventSource | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const flushPending = () => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      lastFlushAtRef.current = Date.now();
      setLivePatch((previous) => ({ ...(previous ?? {}), ...pending.patch }));
      setSessionStats((previous) => ({
        ...(previous ?? {}),
        ...Object.fromEntries(
          Object.entries(pending.stats).filter(
            ([, value]) => value !== undefined,
          ),
        ),
      }));
      setStreamStatus('live');
    };

    const scheduleFlush = (next: {
      patch: Partial<MarketSnapshot>;
      stats: SessionQuoteStats;
    }) => {
      pendingRef.current = {
        patch: { ...(pendingRef.current?.patch ?? {}), ...next.patch },
        stats: { ...(pendingRef.current?.stats ?? {}), ...next.stats },
      };
      const elapsed = Date.now() - lastFlushAtRef.current;
      if (elapsed >= LIVE_UI_MIN_INTERVAL_MS) {
        if (flushTimerRef.current !== undefined) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = undefined;
        }
        flushPending();
        return;
      }
      if (flushTimerRef.current !== undefined) return;
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = undefined;
        flushPending();
      }, LIVE_UI_MIN_INTERVAL_MS - elapsed);
    };

    const disconnect = () => {
      source?.close();
      source = null;
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      refreshTimer = undefined;
      retryTimer = undefined;
    };

    const connect = (token: {
      token: string;
      sseUrl: string;
      expiresAt: number;
    }) => {
      disconnect();
      if (cancelled) return;
      setStreamStatus('connecting');

      const url = new URL(token.sseUrl);
      url.searchParams.set('token', token.token);
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
        scheduleFlush(applied);
      };

      source.onerror = () => {
        if (cancelled) return;
        setStreamStatus('error');
        source?.close();
        source = null;
        retryTimer = setTimeout(() => {
          void streamToken.refetch().then((result) => {
            if (result.data) connect(result.data);
          });
        }, 5_000);
      };

      const refreshInMs = Math.max(
        token.expiresAt - Date.now() - 60_000,
        30_000,
      );
      refreshTimer = setTimeout(() => {
        void streamToken.refetch().then((result) => {
          if (result.data) connect(result.data);
        });
      }, refreshInMs);
    };

    connect(streamToken.data);

    return () => {
      cancelled = true;
      disconnect();
      if (flushTimerRef.current !== undefined) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = undefined;
      }
      pendingRef.current = null;
    };
    // snapshot.data / streamToken.refetch intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconnect on symbol/token payload
  }, [providerSymbol, streamToken.data?.token, streamToken.data?.sseUrl]);

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

  const refresh = useCallback(async () => {
    if (!providerSymbol || refreshing) return;
    setRefreshing(true);
    try {
      const response = await getMarketSnapshot(providerSymbol, {
        refresh: true,
      });
      queryClient.setQueryData(
        ['market-snapshot', providerSymbol],
        response.data,
      );
      setLivePatch(null);
      setSessionStats({
        open: response.data.open,
        high: response.data.high,
        low: response.data.low,
        volume: response.data.volume,
      });
    } finally {
      setRefreshing(false);
    }
  }, [providerSymbol, queryClient, refreshing]);

  return {
    quote,
    sessionStats: mergedStats,
    streamStatus,
    loading: snapshot.isLoading && !quote,
    refreshing,
    refresh,
    error: snapshot.isError && !quote,
  };
}
