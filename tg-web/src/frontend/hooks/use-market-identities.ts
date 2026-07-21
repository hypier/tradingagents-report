import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  getMarketIdentities,
  type AnalysisJob,
  type AssetIdentity,
} from '@/frontend/lib/research';

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeTickers(tickers: string[]) {
  return [
    ...new Set(
      tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean),
    ),
  ].sort();
}

/** Long-lived client cache of TradingView identities (name + logo_url). */
export function useMarketIdentities(tickers: string[]) {
  const unique = useMemo(() => normalizeTickers(tickers), [tickers]);

  return useQuery({
    queryKey: ['market-identities', unique],
    queryFn: async (): Promise<Record<string, AssetIdentity>> => {
      if (!unique.length) return {};
      const response = await getMarketIdentities(unique);
      return Object.fromEntries(
        response.data.map((identity) => [
          identity.ticker.trim().toUpperCase(),
          identity,
        ]),
      );
    },
    enabled: unique.length > 0,
    staleTime: DAY_MS,
    gcTime: 7 * DAY_MS,
  });
}

/**
 * Prefer job.display when present; only request identities for tickers
 * still missing logo or display name.
 */
export function useJobMarketIdentities(jobs: AnalysisJob[]) {
  const tickers = useMemo(() => {
    const needed: string[] = [];
    for (const job of jobs) {
      const ticker = job.ticker?.trim();
      if (!ticker) continue;
      const hasLogo = Boolean(job.display?.logo_url?.trim());
      const hasName = Boolean(job.display?.display_name?.trim());
      if (!hasLogo || !hasName) needed.push(ticker);
    }
    return needed;
  }, [jobs]);

  const query = useMarketIdentities(tickers);
  return {
    identities: query.data ?? {},
    loading: query.isLoading,
    error: query.isError,
  };
}
