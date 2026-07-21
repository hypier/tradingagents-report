import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookmarkPlus, Play, RefreshCw, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { AppShell } from '../components/app-shell';
import { ReportsTable } from '../components/dashboard/recent-reports';
import { InstrumentIdentity } from '../components/instrument-identity';
import { SessionStatsRow } from '../components/market/session-stats-row';
import { StockQuoteMetrics } from '../components/market/stock-quote-metrics';
import { TradingViewAdvancedChart } from '../components/market/tradingview-advanced-chart';
import { PageBody } from '../components/page-chrome';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Button } from '../components/ui/button';
import { Spinner } from '../components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../components/ui/tooltip';
import { useLiveQuote } from '../hooks/use-live-quote';
import { useJobMarketIdentities } from '../hooks/use-market-identities';
import { formatLocaleDateTimeValue } from '../lib/format-locale';
import { cn } from '../lib/utils';
import { listResearch } from '../lib/research';
import {
  addWatchlistItem,
  getWatchlist,
  removeWatchlistItem,
} from '../lib/watchlist';
import { isSupportedExchange, listingForQuoteView } from '@/shared/listing';

export function StockPage() {
  const { t } = useTranslation(['stock', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { providerSymbol: rawSymbol = '' } = useParams();
  const providerSymbol = decodeURIComponent(rawSymbol).toUpperCase();

  let listing: ReturnType<typeof listingForQuoteView> | null = null;
  try {
    listing = listingForQuoteView(providerSymbol);
  } catch {
    listing = null;
  }
  const analyzable = Boolean(
    listing?.exchange && isSupportedExchange(listing.exchange),
  );

  const {
    quote,
    sessionStats,
    streamStatus,
    loading: quoteLoading,
    refreshing: quoteRefreshing,
    refresh: refreshQuote,
    error: quoteError,
  } = useLiveQuote(listing ? providerSymbol : '');

  const reports = useQuery({
    queryKey: ['stock-reports', listing?.display_ticker],
    queryFn: () =>
      listResearch({
        ticker: listing!.display_ticker,
        limit: 50,
        status: 'succeeded',
        archived: false,
      }),
    enabled: Boolean(listing?.display_ticker),
    staleTime: 30_000,
  });
  const { identities } = useJobMarketIdentities(reports.data?.data ?? []);
  const watchlist = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => getWatchlist(),
    staleTime: 60_000,
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

  const reportDisplay = reports.data?.data.find(
    (job) => job.display?.display_name || job.display?.logo_url,
  )?.display;
  const displayName =
    quote?.display_name?.trim() ||
    reportDisplay?.display_name?.trim() ||
    existingItem?.displayName?.trim() ||
    listing?.display_ticker ||
    '';
  const logoUrl =
    quote?.logo_url?.trim() ||
    reportDisplay?.logo_url?.trim() ||
    existingItem?.logoUrl?.trim() ||
    undefined;

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

  const statusLabel =
    streamStatus === 'live'
      ? t('quote.live')
      : streamStatus === 'connecting'
        ? t('quote.connecting')
        : null;
  const asOfLabel = quote?.as_of
    ? t('quote.asOf', { time: formatLocaleDateTimeValue(quote.as_of) })
    : null;

  return (
    <AppShell>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-border">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-5 py-2.5 lg:px-6">
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground"
                >
                  <Link to="/quotes" aria-label={t('backToQuotes')}>
                    <ArrowLeft className="size-4" />
                  </Link>
                </Button>

                <Avatar className="size-16 shrink-0 !rounded-none after:hidden">
                  <AvatarImage
                    key={logoUrl ?? 'missing'}
                    className="!rounded-none object-contain"
                    src={logoUrl}
                    alt={displayName || listing.display_ticker}
                  />
                  <AvatarFallback className="!rounded-none text-xl font-semibold">
                    {listing.symbol.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0">
                  <InstrumentIdentity
                    density="header"
                    nameAs="h1"
                    name={displayName}
                    ticker={listing.provider_symbol ?? listing.display_ticker}
                    nameClassName="text-lg"
                    tickerClassName="mt-0.5 text-xs"
                  />
                  {statusLabel || asOfLabel ? (
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {streamStatus === 'live' ? (
                        <span
                          className="size-1.5 shrink-0 bg-accent"
                          aria-hidden
                        />
                      ) : null}
                      {statusLabel ? (
                        <span className="shrink-0">{statusLabel}</span>
                      ) : null}
                      {statusLabel && asOfLabel ? (
                        <span aria-hidden>·</span>
                      ) : null}
                      {asOfLabel ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="truncate border-b border-dotted border-muted-foreground/50 text-left hover:text-foreground"
                            >
                              {asOfLabel}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" sideOffset={6}>
                            {t('quote.asOfTip')}
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="hidden h-8 w-px shrink-0 bg-border sm:block" />

              {quoteError ? (
                <p className="max-w-[16rem] text-xs text-destructive">
                  {t('quote.errorBody')}
                </p>
              ) : (
                <div className="flex items-center gap-1.5">
                  <StockQuoteMetrics
                    quote={quote}
                    loading={quoteLoading}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-muted-foreground"
                        disabled={quoteLoading || quoteRefreshing}
                        aria-label={t('quote.refresh')}
                        onClick={() => {
                          void refreshQuote().catch(() => {
                            toast.error(t('quote.refreshError'));
                          });
                        }}
                      >
                        <RefreshCw
                          className={cn(
                            'size-3.5',
                            quoteRefreshing && 'animate-spin',
                          )}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6}>
                      {t('quote.refresh')}
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {analyzable ? (
                <Button asChild size="sm">
                  <Link to={`/?symbol=${encodeURIComponent(providerSymbol)}`}>
                    <Play data-icon="inline-start" />
                    {t('actions.analyze')}
                  </Link>
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button size="sm" disabled>
                        <Play data-icon="inline-start" />
                        {t('actions.analyze')}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6}>
                    {t('actions.analyzeUnsupported')}
                  </TooltipContent>
                </Tooltip>
              )}
              {existingItem ? (
                <Button
                  variant="outline"
                  size="sm"
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
                  size="sm"
                  disabled={!defaultGroupId || addItem.isPending}
                  onClick={() => {
                    if (!defaultGroupId || !listing) return;
                    addItem.mutate({
                      groupId: defaultGroupId,
                      exchange: listing.exchange ?? '',
                      symbol: listing.symbol,
                      displayTicker: listing.display_ticker,
                      providerSymbol:
                        listing.provider_symbol ?? providerSymbol,
                      displayName: displayName || listing.display_ticker,
                      logoUrl: logoUrl ?? null,
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

          {!quoteError ? <SessionStatsRow stats={sessionStats} /> : null}
        </header>

        <PageBody>
          <section className="space-y-3" aria-labelledby="stock-chart-title">
            <h2
              id="stock-chart-title"
              className="text-sm font-semibold tracking-tight"
            >
              {t('chart.title')}
            </h2>
            <TradingViewAdvancedChart symbol={providerSymbol} height={420} />
          </section>

          <ReportsTable
            jobs={reports.data?.data ?? []}
            loading={reports.isLoading}
            error={reports.isError}
            identities={identities}
            onOpenReport={(id) => navigate(`/reports/${id}`)}
            title={t('reports.title')}
            description={t('reports.description')}
            titleId="stock-reports-title"
            variant="library"
            hideSectionHeader
          />
        </PageBody>
      </div>
    </AppShell>
  );
}
