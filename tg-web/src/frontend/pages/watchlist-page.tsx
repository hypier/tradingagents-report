import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CandlestickChart,
  Layers,
  List,
  LoaderCircle,
  Play,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import {
  displayNameForTvMarket,
  getTvMarketEntry,
  marketFromExchange,
  productMarketToTradingViewCode,
} from '@/shared/market-codes';

import { AppShell } from '../components/app-shell';
import { InstrumentIdentity } from '../components/instrument-identity';
import { InstrumentLogo } from '../components/instrument-logo';
import { PriceSparkline } from '../components/market/price-sparkline';
import { PageFrame, PageToolbar } from '../components/page-chrome';
import { TickerSearch } from '../components/ticker-search';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../components/ui/empty';
import { Skeleton } from '../components/ui/skeleton';
import { Spinner } from '../components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../components/ui/tooltip';
import { normalizeUiLocale } from '../i18n/locales';
import {
  formatLocaleDateTimeValue,
  formatLocaleNumber,
  parseSortableDateInput,
} from '../lib/format-locale';
import {
  getMarketOhlcv,
  getMarketQuotes,
  type MarketQuote,
  type SelectedInstrument,
} from '../lib/research';
import { cn } from '../lib/utils';
import {
  addWatchlistItem,
  getWatchlist,
  removeWatchlistItem,
  type WatchlistItem,
} from '../lib/watchlist';

/** Daily bars for the in-row sparkline only (price/change come from batch quotes). */
const SPARKLINE_TIMEFRAME = 'D';
const SPARKLINE_RANGE = 30;

const VIEW_MODE_STORAGE_KEY = 'tg.watchlist.viewMode';
type WatchlistViewMode = 'grouped' | 'list';

/** Same TV market codes as the quotes desk picker; unknown exchanges follow. */
const MARKET_SECTION_ORDER = ['china', 'hongkong', 'america'] as const;

type WatchlistMarketSection = {
  key: string;
  items: WatchlistItem[];
};

function loadWatchlistViewMode(): WatchlistViewMode {
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (raw === 'list' || raw === 'grouped') return raw;
  } catch {
    // ignore
  }
  return 'grouped';
}

function saveWatchlistViewMode(mode: WatchlistViewMode) {
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

function marketSectionKey(item: WatchlistItem): string {
  const tvMarket = productMarketToTradingViewCode(
    marketFromExchange(item.exchange),
  );
  if (tvMarket) return tvMarket;
  const exchange = item.exchange.trim().toUpperCase();
  return exchange || 'other';
}

function groupWatchlistByMarket(items: WatchlistItem[]): WatchlistMarketSection[] {
  const buckets = new Map<string, WatchlistItem[]>();
  for (const item of items) {
    const key = marketSectionKey(item);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(key, [item]);
    }
  }

  const preferred = new Set<string>(MARKET_SECTION_ORDER);
  const sections: WatchlistMarketSection[] = [];

  for (const key of MARKET_SECTION_ORDER) {
    const bucket = buckets.get(key);
    if (bucket?.length) {
      sections.push({ key, items: bucket });
    }
  }

  const rest = [...buckets.keys()]
    .filter((key) => !preferred.has(key))
    .sort((a, b) => a.localeCompare(b));
  for (const key of rest) {
    const bucket = buckets.get(key);
    if (bucket?.length) {
      sections.push({ key, items: bucket });
    }
  }

  return sections;
}

function marketSectionLabel(key: string, locale: 'en' | 'zh'): string {
  return getTvMarketEntry(key)
    ? displayNameForTvMarket(key, locale)
    : key;
}

function changeClass(changePercent: number) {
  if (changePercent > 0) return 'text-market-up';
  if (changePercent < 0) return 'text-market-down';
  return 'text-muted-foreground';
}

function quotesBySymbol(quotes: MarketQuote[] | undefined) {
  const map = new Map<string, MarketQuote>();
  for (const quote of quotes ?? []) {
    map.set(quote.symbol.trim().toUpperCase(), quote);
  }
  return map;
}

export function WatchlistPage() {
  const { t, i18n } = useTranslation(['watchlist', 'common']);
  const locale = normalizeUiLocale(i18n.language) === 'zh' ? 'zh' : 'en';
  const queryClient = useQueryClient();
  const [pendingInstrument, setPendingInstrument] =
    useState<SelectedInstrument | null>(null);
  const [viewMode, setViewMode] = useState<WatchlistViewMode>(() =>
    loadWatchlistViewMode(),
  );
  const watchlist = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => getWatchlist(),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['watchlist'] });

  const addItem = useMutation({
    mutationFn: (input: Parameters<typeof addWatchlistItem>[0]) =>
      addWatchlistItem(input),
    onSuccess: () => {
      setPendingInstrument(null);
      void refresh();
      toast.success(t('toasts.added'));
    },
    onError: () => toast.error(t('toasts.addError')),
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => removeWatchlistItem(itemId),
    onSuccess: () => {
      void refresh();
      toast.success(t('toasts.removed'));
    },
    onError: () => toast.error(t('toasts.removeError')),
  });

  const items = watchlist.data?.data.items ?? [];
  const listItems = [...items].sort(
    (a, b) =>
      parseSortableDateInput(b.createdAt) - parseSortableDateInput(a.createdAt),
  );
  const marketSections = groupWatchlistByMarket(items);
  const providerSymbols = [
    ...new Set(
      items
        .map((item) => item.providerSymbol.trim().toUpperCase())
        .filter((symbol) => symbol.includes(':')),
    ),
  ].sort();
  const quotes = useQuery({
    queryKey: ['market-quotes', providerSymbols],
    queryFn: async () => {
      const response = await getMarketQuotes(providerSymbols);
      return response.data;
    },
    enabled: providerSymbols.length > 0,
    staleTime: 20_000,
  });
  const quoteMap = quotesBySymbol(quotes.data);
  const alreadySaved = Boolean(
    pendingInstrument &&
      items.some(
        (item) => item.providerSymbol === pendingInstrument.provider_symbol,
      ),
  );

  function handleViewModeToggle() {
    const next: WatchlistViewMode =
      viewMode === 'grouped' ? 'list' : 'grouped';
    setViewMode(next);
    saveWatchlistViewMode(next);
  }

  function handleAdd() {
    if (!pendingInstrument || alreadySaved) return;
    addItem.mutate({
      exchange: pendingInstrument.exchange,
      symbol: pendingInstrument.symbol,
      displayTicker: pendingInstrument.display_ticker,
      providerSymbol: pendingInstrument.provider_symbol,
      displayName: pendingInstrument.display_name,
      logoUrl: pendingInstrument.logo_url ?? null,
    });
  }

  function renderRows(rowItems: WatchlistItem[]) {
    return (
      <ul className="divide-y divide-border">
        {rowItems.map((item) => (
          <WatchlistRow
            key={item.id}
            item={item}
            quote={quoteMap.get(item.providerSymbol.trim().toUpperCase())}
            quotesLoading={quotes.isLoading}
            removing={
              removeItem.isPending && removeItem.variables === item.id
            }
            onRemove={() => removeItem.mutate(item.id)}
          />
        ))}
      </ul>
    );
  }

  return (
    <AppShell>
      <PageFrame
        title={t('title')}
        description={t('subtitle')}
        bodyClassName="gap-0 p-0"
        toolbar={
          <PageToolbar>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <TickerSearch
                  value={pendingInstrument}
                  onChange={setPendingInstrument}
                />
              </div>
              <Button
                className="shrink-0 sm:self-stretch"
                disabled={
                  !pendingInstrument ||
                  alreadySaved ||
                  addItem.isPending
                }
                onClick={handleAdd}
              >
                {addItem.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Plus data-icon="inline-start" />
                )}
                {alreadySaved ? t('add.already') : t('add.action')}
              </Button>
            </div>
          </PageToolbar>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {watchlist.isLoading ? (
            <div className="flex flex-col gap-0 border-t border-border">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full rounded-none" />
              ))}
            </div>
          ) : watchlist.isError ? (
            <div className="px-5 py-5 lg:px-6">
              <Alert variant="destructive">
                <AlertTitle>{t('loadError.title')}</AlertTitle>
                <AlertDescription>{t('loadError.body')}</AlertDescription>
              </Alert>
            </div>
          ) : items.length === 0 ? (
            <div className="px-5 py-10 lg:px-6">
              <Empty className="border border-border py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Star />
                  </EmptyMedia>
                  <EmptyTitle>{t('empty.title')}</EmptyTitle>
                  <EmptyDescription>{t('empty.body')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-end border-b border-border px-5 py-2.5 lg:px-6">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleViewModeToggle}
                  aria-label={t('view.toggle', {
                    mode:
                      viewMode === 'grouped'
                        ? t('view.grouped')
                        : t('view.list'),
                    count: items.length,
                  })}
                >
                  {viewMode === 'grouped' ? <Layers /> : <List />}
                  <span>
                    {viewMode === 'grouped'
                      ? t('view.grouped')
                      : t('view.list')}
                  </span>
                  <Badge
                    variant="secondary"
                    className="ml-0.5 font-mono text-xs tabular-nums"
                  >
                    {items.length}
                  </Badge>
                </Button>
              </div>
              {viewMode === 'list' ? (
                <div>{renderRows(listItems)}</div>
              ) : (
                <div>
                  {marketSections.map((section) => (
                    <section
                      key={section.key}
                      aria-labelledby={`watchlist-market-${section.key}`}
                    >
                      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-5 py-2.5 backdrop-blur-md lg:px-6">
                        <h2
                          id={`watchlist-market-${section.key}`}
                          className="font-label-caps text-muted-foreground"
                        >
                          {marketSectionLabel(section.key, locale)}
                        </h2>
                        <Badge
                          variant="outline"
                          className="font-mono text-xs tabular-nums"
                        >
                          {section.items.length}
                        </Badge>
                      </div>
                      {renderRows(section.items)}
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </PageFrame>
    </AppShell>
  );
}

function WatchlistRow({
  item,
  quote,
  quotesLoading,
  removing,
  onRemove,
}: {
  item: WatchlistItem;
  quote: MarketQuote | undefined;
  quotesLoading: boolean;
  removing: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation('watchlist');
  const sparkline = useQuery({
    queryKey: [
      'market-ohlcv',
      item.providerSymbol,
      SPARKLINE_TIMEFRAME,
      SPARKLINE_RANGE,
    ],
    queryFn: async () => {
      const response = await getMarketOhlcv(
        item.providerSymbol,
        SPARKLINE_TIMEFRAME,
        { range: SPARKLINE_RANGE },
      );
      return response.data;
    },
    staleTime: 60_000,
    enabled: Boolean(item.providerSymbol),
  });

  const closes =
    sparkline.data?.bars
      .map((bar) => bar.close)
      .filter((close) => Number.isFinite(close)) ?? [];
  const lastPrice = quote?.price ?? null;
  const currency = quote?.currency;
  const changePct =
    quote && Number.isFinite(quote.change_percent)
      ? quote.change_percent
      : null;
  const changeLabel =
    changePct === null
      ? null
      : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`;
  const addedLabel = formatLocaleDateTimeValue(item.createdAt);

  return (
    <li className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/50 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-5">
        <Link
          to={`/stocks/${encodeURIComponent(item.providerSymbol)}`}
          className="flex w-[11rem] shrink-0 items-center gap-2.5 hover:opacity-90 sm:w-[13rem] md:w-[15rem]"
        >
          <InstrumentLogo
            symbol={item.providerSymbol || item.displayTicker}
            logoUrl={item.logoUrl}
            alt={item.displayName || item.displayTicker}
            size="md"
          />
          <InstrumentIdentity
            density="row"
            name={item.displayName || item.displayTicker}
            ticker={item.displayTicker}
          />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {quotesLoading && !quote ? (
            <Skeleton className="h-7 w-20 rounded-none sm:w-28" />
          ) : lastPrice !== null ? (
            <>
              {closes.length >= 2 ? (
                <span className="hidden sm:inline-flex">
                  <PriceSparkline values={closes} />
                </span>
              ) : null}
              <div className="flex min-w-[4.5rem] flex-col items-end gap-0.5 sm:min-w-[5.5rem]">
                <span className="font-mono text-sm tabular-nums text-foreground">
                  {formatLocaleNumber(lastPrice)}
                  {currency ? (
                    <span className="ml-1 text-[11px] text-muted-foreground">
                      {currency}
                    </span>
                  ) : null}
                </span>
                {changeLabel ? (
                  <span
                    className={cn(
                      'font-mono text-xs tabular-nums',
                      changeClass(changePct!),
                    )}
                  >
                    {changeLabel}
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">—</span>
          )}
        </div>

        {addedLabel ? (
          <time
            dateTime={item.createdAt}
            title={t('addedAt', { time: addedLabel })}
            className="hidden shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground md:block"
          >
            {addedLabel}
          </time>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button asChild size="sm" variant="outline">
          <Link to={`/stocks/${encodeURIComponent(item.providerSymbol)}`}>
            <CandlestickChart data-icon="inline-start" />
            {t('actions.quote')}
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link to={`/?symbol=${encodeURIComponent(item.providerSymbol)}`}>
            <Play data-icon="inline-start" />
            {t('actions.analyze')}
          </Link>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('actions.remove')}
              onClick={onRemove}
              disabled={removing}
            >
              {removing ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {t('actions.remove')}
          </TooltipContent>
        </Tooltip>
      </div>
    </li>
  );
}
