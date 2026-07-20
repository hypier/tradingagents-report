import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  BookmarkPlus,
  Play,
  Star,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { AppShell } from '../components/app-shell';
import { ReportsTable } from '../components/dashboard/recent-reports';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Spinner } from '../components/ui/spinner';
import {
  formatLocaleDateTimeValue,
  formatLocaleNumber,
} from '../lib/format-locale';
import { snapshotFreshness } from '../lib/snapshot-freshness';
import { cn } from '../lib/utils';
import {
  getMarketSnapshot,
  listResearch,
} from '../lib/research';
import {
  addWatchlistItem,
  getWatchlist,
  removeWatchlistItem,
} from '../lib/watchlist';
import { listingFromProviderSymbol } from '@/shared/listing';

export function StockPage() {
  const { t } = useTranslation(['stock', 'common', 'home']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { providerSymbol: rawSymbol = '' } = useParams();
  const providerSymbol = decodeURIComponent(rawSymbol).toUpperCase();

  let listing: ReturnType<typeof listingFromProviderSymbol> | null = null;
  try {
    listing = listingFromProviderSymbol(providerSymbol);
  } catch {
    listing = null;
  }

  const snapshot = useQuery({
    queryKey: ['snapshot', providerSymbol],
    queryFn: () => getMarketSnapshot(providerSymbol),
    enabled: Boolean(listing),
  });
  const reports = useQuery({
    queryKey: ['stock-reports', listing?.display_ticker],
    queryFn: () =>
      listResearch({
        ticker: listing!.display_ticker,
        limit: 20,
      }),
    enabled: Boolean(listing?.display_ticker),
  });
  const watchlist = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => getWatchlist(),
  });

  const existingItem = watchlist.data?.data.groups
    .flatMap((group) => group.items)
    .find((item) => item.providerSymbol === providerSymbol);
  const defaultGroupId = watchlist.data?.data.groups[0]?.id;

  const addItem = useMutation({
    mutationFn: (input: Parameters<typeof addWatchlistItem>[0]) =>
      addWatchlistItem(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success(t('watchlist.added'));
    },
    onError: () => toast.error(t('watchlist.addError')),
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => removeWatchlistItem(itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success(t('watchlist.removed'));
    },
    onError: () => toast.error(t('watchlist.removeError')),
  });

  const quote = snapshot.data?.data;
  const freshness = snapshotFreshness(quote?.as_of);
  const changePercent = quote?.change_percent;
  const isUp = changePercent !== undefined && changePercent > 0;
  const isDown = changePercent !== undefined && changePercent < 0;

  if (!listing) {
    return (
      <AppShell>
        <div className="px-4 py-6 lg:px-6">
          <Alert variant="destructive">
            <AlertTitle>{t('invalid.title')}</AlertTitle>
            <AlertDescription>{t('invalid.body')}</AlertDescription>
          </Alert>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Avatar size="lg" className="size-14 rounded-xl after:rounded-xl">
              <AvatarImage
                className="rounded-xl"
                src={quote?.logo_url}
                alt={quote?.display_name ?? listing.display_ticker}
              />
              <AvatarFallback className="rounded-xl text-lg font-semibold">
                {listing.symbol.slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {quote?.display_name ?? listing.display_ticker}
              </h1>
              <p className="font-mono text-sm text-muted-foreground">
                {listing.display_ticker} · {listing.provider_symbol}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {listing.exchange ? (
                  <Badge variant="secondary">{listing.exchange}</Badge>
                ) : null}
                {quote?.currency ? (
                  <Badge variant="outline">{quote.currency}</Badge>
                ) : null}
                <Badge variant="outline">
                  {freshness === 'stale'
                    ? t('home:snapshot.stale')
                    : t('home:snapshot.asOf')}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={`/?symbol=${encodeURIComponent(providerSymbol)}`}>
                <Play data-icon="inline-start" />
                {t('actions.analyze')}
              </Link>
            </Button>
            {existingItem ? (
              <Button
                variant="outline"
                disabled={removeItem.isPending}
                onClick={() => removeItem.mutate(existingItem.id)}
              >
                {removeItem.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Star data-icon="inline-start" className="fill-current" />
                )}
                {t('actions.removeWatchlist')}
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={!defaultGroupId || addItem.isPending}
                onClick={() => {
                  if (!defaultGroupId || !listing) return;
                  addItem.mutate({
                    groupId: defaultGroupId,
                    exchange: listing.exchange ?? '',
                    symbol: listing.symbol,
                    displayTicker: listing.display_ticker,
                    providerSymbol: listing.provider_symbol ?? providerSymbol,
                    displayName:
                      quote?.display_name ?? listing.display_ticker,
                    logoUrl: quote?.logo_url ?? null,
                  });
                }}
              >
                {addItem.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <BookmarkPlus data-icon="inline-start" />
                )}
                {t('actions.addWatchlist')}
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('quote.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {snapshot.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : snapshot.isError || !quote ? (
              <Alert variant="destructive">
                <AlertTitle>{t('quote.errorTitle')}</AlertTitle>
                <AlertDescription>{t('quote.errorBody')}</AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                <p
                  className={cn(
                    'font-mono text-4xl font-semibold tabular-nums',
                    isUp && 'text-market-up',
                    isDown && 'text-market-down',
                  )}
                >
                  {formatLocaleNumber(quote.last_price ?? 0)}
                  <span className="ml-2 text-base font-medium text-muted-foreground">
                    {quote.currency}
                  </span>
                </p>
                <Badge
                  variant={
                    changePercent === undefined || changePercent === 0
                      ? 'outline'
                      : changePercent > 0
                        ? 'up'
                        : 'down'
                  }
                  className="gap-1"
                >
                  {isUp ? <ArrowUpRight className="size-4" /> : null}
                  {isDown ? <ArrowDownRight className="size-4" /> : null}
                  {changePercent === undefined
                    ? t('home:snapshot.changeUnavailable')
                    : `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {quote.source ?? 'TradingView'}
                  {quote.as_of
                    ? ` · ${formatLocaleDateTimeValue(quote.as_of)}`
                    : ''}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <ReportsTable
          jobs={reports.data?.data ?? []}
          loading={reports.isLoading}
          error={reports.isError}
          identities={{}}
          onOpenReport={(id) => navigate(`/reports/${id}`)}
          title={t('reports.title')}
          description={t('reports.description')}
          titleId="stock-reports-title"
        />
      </div>
    </AppShell>
  );
}
