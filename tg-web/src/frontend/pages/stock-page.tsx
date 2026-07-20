import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, Play, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { AppShell } from '../components/app-shell';
import { QuoteStrip } from '../components/dashboard/quote-strip';
import { ReportsTable } from '../components/dashboard/recent-reports';
import { PageBody } from '../components/page-chrome';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Spinner } from '../components/ui/spinner';
import { formatSnapshotDelay, snapshotFreshness } from '../lib/snapshot-freshness';
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
  const freshness = snapshotFreshness({
    asOf: quote?.as_of,
    updateMode: quote?.update_mode,
    delaySeconds: quote?.delay_seconds,
  });
  const delayLabel = formatSnapshotDelay({
    asOf: quote?.as_of,
    updateMode: quote?.update_mode,
    delaySeconds: quote?.delay_seconds,
  });

  if (!listing) {
    return (
      <AppShell>
        <PageBody>
          <Alert variant="destructive">
            <AlertTitle>{t('invalid.title')}</AlertTitle>
            <AlertDescription>{t('invalid.body')}</AlertDescription>
          </Alert>
        </PageBody>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border">
          <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-3.5 lg:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <Avatar
                size="lg"
                className="size-12 !rounded-none after:!rounded-none"
              >
                <AvatarImage
                  className="!rounded-none"
                  src={quote?.logo_url}
                  alt={quote?.display_name ?? listing.display_ticker}
                />
                <AvatarFallback className="!rounded-none text-lg font-semibold">
                  {listing.symbol.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight">
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
                      ? delayLabel
                        ? t('home:snapshot.staleWithAge', { age: delayLabel })
                        : t('home:snapshot.stale')
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
        </div>

        <PageBody>
          {snapshot.isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : snapshot.isError || !quote ? (
            <Alert variant="destructive">
              <AlertTitle>{t('quote.errorTitle')}</AlertTitle>
              <AlertDescription>{t('quote.errorBody')}</AlertDescription>
            </Alert>
          ) : (
            <QuoteStrip
              variant="panel"
              quote={{
                ticker: listing.display_ticker,
                display_ticker: listing.display_ticker,
                display_name: quote.display_name,
                last_price: quote.last_price,
                change: quote.change,
                change_percent: quote.change_percent,
                currency: quote.currency,
                source: quote.source,
                as_of: quote.as_of,
                update_mode: quote.update_mode,
                delay_seconds: quote.delay_seconds,
                logo_url: quote.logo_url,
              }}
            />
          )}

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
        </PageBody>
      </div>
    </AppShell>
  );
}
