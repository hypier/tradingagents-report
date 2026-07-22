import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { BoardTabsNav } from '@/frontend/components/market/board-tabs-nav';
import { MarketCodePicker } from '@/frontend/components/market/market-code-picker';
import {
  PinnedIndices,
  TickerTape,
} from '@/frontend/components/market/ticker-tape';
import { AppShell } from '@/frontend/components/app-shell';
import { InstrumentIdentity } from '@/frontend/components/instrument-identity';
import { InstrumentLogo } from '@/frontend/components/instrument-logo';
import { PageFrame } from '@/frontend/components/page-chrome';
import { TickerSearch } from '@/frontend/components/ticker-search';
import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import { getAccountProfile } from '@/frontend/lib/account';
import { getMarketBoard, getMarketTape } from '@/frontend/lib/market-board';
import {
  formatLocaleCompactNumber,
  formatLocaleDateTimeValue,
  formatLocaleNumber,
} from '@/frontend/lib/format-locale';
import { loadRecentTvMarkets } from '@/frontend/lib/recent-tv-markets';
import type { SelectedInstrument } from '@/frontend/lib/research';
import { cn } from '@/frontend/lib/utils';
import { normalizeUiLocale } from '@/frontend/i18n/locales';
import {
  DEFAULT_TV_MARKET_CODE,
  isKnownTvMarketCode,
  productMarketToTradingViewCode,
  STOCK_LEADERBOARD_TABS,
  type StockLeaderboardTab,
} from '@/shared/market-codes';

function initialQuotesMarketCode() {
  return loadRecentTvMarkets()[0] ?? DEFAULT_TV_MARKET_CODE;
}

const BOARD_TABS = STOCK_LEADERBOARD_TABS;

function changeBadgeVariant(changePercent: number) {
  if (changePercent > 0) return 'up' as const;
  if (changePercent < 0) return 'down' as const;
  return 'outline' as const;
}

function formatRatio(value?: number) {
  if (value === undefined) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function QuotesPage() {
  const { t, i18n } = useTranslation(['quotes', 'common']);
  const navigate = useNavigate();
  const lang = normalizeUiLocale(i18n.language) === 'zh' ? 'zh' : 'en';
  const [marketCode, setMarketCode] = useState(initialQuotesMarketCode);
  const [tab, setTab] = useState<StockLeaderboardTab>('active');
  const [searchInstrument, setSearchInstrument] =
    useState<SelectedInstrument | null>(null);
  const [defaultApplied, setDefaultApplied] = useState(
    () => loadRecentTvMarkets().length > 0,
  );

  const account = useQuery({
    queryKey: ['account-profile'],
    queryFn: () => getAccountProfile(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (defaultApplied) return;
    // Prefer last market picked on this device; account default is fallback only.
    const cached = loadRecentTvMarkets()[0];
    if (cached) {
      setMarketCode(cached);
      setDefaultApplied(true);
      return;
    }
    const preferred = productMarketToTradingViewCode(
      account.data?.data.profile.defaultMarket,
    );
    if (preferred) {
      setMarketCode(preferred);
      setDefaultApplied(true);
      return;
    }
    if (account.isFetched || account.isError) {
      setDefaultApplied(true);
    }
  }, [account.data, account.isError, account.isFetched, defaultApplied]);

  useEffect(() => {
    if (!isKnownTvMarketCode(marketCode)) {
      setMarketCode(DEFAULT_TV_MARKET_CODE);
    }
  }, [marketCode]);

  const tape = useQuery({
    queryKey: ['market-tape', marketCode, lang],
    queryFn: () => getMarketTape(marketCode, lang),
    refetchInterval: 45_000,
  });

  const board = useQuery({
    queryKey: ['market-board', marketCode, tab, lang],
    queryFn: () =>
      getMarketBoard({
        marketCode,
        tab,
        count: 50,
        lang,
      }),
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  const tapeUpdatedAt = tape.dataUpdatedAt;
  const boardUpdatedAt = board.dataUpdatedAt;

  const freshnessLine = useMemo(() => {
    const stamp = Math.max(tapeUpdatedAt || 0, boardUpdatedAt || 0);
    if (!stamp) return null;
    const count =
      typeof board.data?.data.totalCount === 'number'
        ? t('summary.symbols', { count: board.data.data.totalCount })
        : null;
    return [count, t('summary.asOf', { time: formatLocaleDateTimeValue(stamp) })]
      .filter(Boolean)
      .join('  ');
  }, [board.data, boardUpdatedAt, t, tapeUpdatedAt]);

  const onSearchSelect = (instrument: SelectedInstrument | null) => {
    setSearchInstrument(instrument);
    if (!instrument?.provider_symbol) return;
    navigate(`/stocks/${encodeURIComponent(instrument.provider_symbol)}`);
  };

  return (
    <AppShell>
      <PageFrame
        title={t('heading')}
        description={
          freshnessLine ? (
            <span className="font-mono text-[11px] tracking-wide text-muted-foreground/80">
              {freshnessLine}
            </span>
          ) : undefined
        }
        actions={
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <MarketCodePicker
              value={marketCode}
              onChange={setMarketCode}
              className="w-full min-w-0 sm:w-52"
            />
            <div className="w-full min-w-0 sm:w-72 sm:max-w-sm">
              <TickerSearch
                value={searchInstrument}
                onChange={onSearchSelect}
              />
            </div>
          </div>
        }
        bodyClassName="gap-0 bg-background p-0 px-0 py-0 lg:px-0 lg:py-0"
        headerClassName="bg-card"
      >
        {tape.isLoading ? (
          <div className="flex h-7 items-center gap-4 overflow-hidden border-b border-border bg-background px-3 sm:gap-6 sm:px-5 lg:px-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-2.5 w-24 shrink-0 rounded-none" />
            ))}
          </div>
        ) : (
          <TickerTape
            items={tape.data?.data.tape ?? []}
            updatedAt={tapeUpdatedAt}
          />
        )}

        <div className="flex min-h-0 flex-1 flex-col">
          {tape.isLoading ? (
            <div className="grid grid-cols-2 border-b border-border bg-card lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex min-h-14 items-center gap-2.5 px-3 py-2 sm:px-4',
                    index % 2 === 1 && 'border-l border-border',
                    index >= 2 && 'border-t border-border lg:border-t-0',
                    index > 0 && 'lg:border-l lg:border-border',
                  )}
                >
                  <Skeleton className="hidden size-6 shrink-0 rounded-none sm:block" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-20 rounded-none" />
                    <Skeleton className="h-2.5 w-14 rounded-none" />
                  </div>
                  <div className="ml-auto space-y-1.5">
                    <Skeleton className="ml-auto h-3 w-14 rounded-none" />
                    <Skeleton className="ml-auto h-2.5 w-10 rounded-none" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <PinnedIndices
              items={tape.data?.data.pinned ?? []}
              updatedAt={tapeUpdatedAt}
            />
          )}

          <div className="border-b border-border bg-card">
            {(tape.isError || board.isError) && (
              <div className="px-3 py-3 sm:px-5 lg:px-6">
                <Alert variant="destructive">
                  <AlertTitle>{t('errors.loadTitle')}</AlertTitle>
                  <AlertDescription>{t('errors.loadBody')}</AlertDescription>
                </Alert>
              </div>
            )}
            <BoardTabsNav
              tabs={BOARD_TABS}
              value={tab}
              onChange={setTab}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-background">
            {board.isLoading ? (
              <div className="space-y-0 px-3 sm:px-5 lg:px-6">
                {Array.from({ length: 10 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex h-11 items-center gap-3 border-b border-border"
                  >
                    <Skeleton className="size-7 rounded-none" />
                    <Skeleton className="h-3.5 w-36 rounded-none" />
                    <Skeleton className="ml-auto h-3.5 w-14 rounded-none" />
                  </div>
                ))}
              </div>
            ) : (
              <Table
                className="w-full min-w-[40rem] xl:min-w-[52rem]"
                containerClassName="overflow-visible"
              >
                <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:border-border">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky left-0 z-20 w-10 bg-card pl-3 font-mono text-[11px] tracking-wide text-muted-foreground/80 sm:w-12 sm:pl-5 lg:pl-6">
                      #
                    </TableHead>
                    <TableHead className="sticky left-10 z-20 w-[14rem] max-w-[14rem] bg-card font-mono text-[11px] tracking-wide text-muted-foreground/80 sm:left-12 sm:w-[16rem] sm:max-w-[16rem]">
                      {t('columns.asset')}
                    </TableHead>
                    <TableHead className="bg-card text-right font-mono text-[11px] tracking-wide text-muted-foreground/80">
                      {t('columns.last')}
                    </TableHead>
                    <TableHead className="bg-card text-right font-mono text-[11px] tracking-wide text-muted-foreground/80">
                      {t('columns.change')}
                    </TableHead>
                    <TableHead className="hidden bg-card text-right font-mono text-[11px] tracking-wide text-muted-foreground/80 md:table-cell">
                      {t('columns.volume')}
                    </TableHead>
                    <TableHead className="hidden bg-card text-right font-mono text-[11px] tracking-wide text-muted-foreground/80 lg:table-cell">
                      {t('columns.mktCap')}
                    </TableHead>
                    <TableHead className="hidden bg-card pr-5 text-right font-mono text-[11px] tracking-wide text-muted-foreground/80 lg:table-cell">
                      {t('columns.pe')}
                    </TableHead>
                    <TableHead className="hidden w-[7.5rem] max-w-[7.5rem] bg-card px-4 font-mono text-[11px] tracking-wide text-muted-foreground/80 xl:table-cell">
                      {t('columns.sector')}
                    </TableHead>
                    <TableHead className="hidden w-[6.5rem] max-w-[6.5rem] bg-card pr-3 text-right font-mono text-[11px] tracking-wide text-muted-foreground/80 xl:table-cell sm:pr-5 lg:pr-6">
                      {t('columns.analyst')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(board.data?.data.items ?? []).map((item, rowIndex) => {
                    const changeLabel = `${item.change_percent >= 0 ? '+' : ''}${item.change_percent.toFixed(2)}%`;
                    const zebra = rowIndex % 2 === 1;
                    // Opaque surfaces so sticky # / 标的 match the row and visibly hover.
                    const cellSurface = cn(
                      zebra ? 'bg-card' : 'bg-background',
                      'group-hover:bg-muted',
                    );
                    return (
                      <TableRow
                        key={item.symbol}
                        className={cn(
                          'group h-11 border-border hover:bg-transparent',
                          item.linkable && 'cursor-pointer',
                        )}
                        data-updated={boardUpdatedAt}
                        onClick={() => {
                          if (!item.linkable) {
                            toast.message(t('toasts.unsupportedExchange'));
                            return;
                          }
                          navigate(
                            `/stocks/${encodeURIComponent(item.symbol)}`,
                          );
                        }}
                      >
                        <TableCell
                          className={cn(
                            'sticky left-0 z-10 pl-3 font-mono text-[11px] tabular-nums text-muted-foreground/70 transition-colors sm:pl-5 lg:pl-6',
                            cellSurface,
                          )}
                        >
                          {item.rank || '—'}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'sticky left-10 z-10 w-[14rem] max-w-[14rem] transition-colors sm:left-12 sm:w-[16rem] sm:max-w-[16rem]',
                            cellSurface,
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <InstrumentLogo
                              symbol={item.symbol}
                              logoUrl={item.logo_url}
                              size="sm"
                            />
                            <InstrumentIdentity
                              name={item.description}
                              ticker={item.name}
                              density="compact"
                              className="min-w-0 flex-1 overflow-hidden"
                              nameClassName="max-w-full text-xs font-medium sm:text-sm"
                              tickerClassName="max-w-full text-muted-foreground/70"
                              tickerSuffix={
                                item.exchange ? ` · ${item.exchange}` : undefined
                              }
                            />
                          </div>
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-mono text-sm font-medium tabular-nums text-foreground transition-colors',
                            cellSurface,
                          )}
                        >
                          {formatLocaleNumber(item.price)}
                          {item.currency ? (
                            <span className="ml-1 text-[11px] font-normal text-muted-foreground/75">
                              {item.currency}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell
                          className={cn('text-right transition-colors', cellSurface)}
                        >
                          <div className="flex justify-end">
                            <Badge
                              variant={changeBadgeVariant(item.change_percent)}
                              className="h-5 px-1.5 font-mono text-[11px] font-semibold tabular-nums"
                            >
                              {changeLabel}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell
                          className={cn(
                            'hidden text-right font-mono text-xs tabular-nums text-muted-foreground/75 transition-colors md:table-cell',
                            cellSurface,
                          )}
                        >
                          {formatLocaleCompactNumber(item.volume)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'hidden text-right font-mono text-xs tabular-nums text-muted-foreground/75 transition-colors lg:table-cell',
                            cellSurface,
                          )}
                        >
                          {formatLocaleCompactNumber(item.market_cap)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'hidden pr-5 text-right font-mono text-xs tabular-nums text-muted-foreground/75 transition-colors lg:table-cell',
                            cellSurface,
                          )}
                        >
                          {formatRatio(item.pe_ratio)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'hidden w-[7.5rem] max-w-[7.5rem] whitespace-normal px-4 text-xs leading-snug text-muted-foreground/75 transition-colors xl:table-cell',
                            'line-clamp-2',
                            cellSurface,
                          )}
                          title={item.sector || undefined}
                        >
                          {item.sector || '—'}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'hidden w-[6.5rem] max-w-[6.5rem] whitespace-normal pr-3 text-right font-mono text-xs leading-snug text-muted-foreground/75 transition-colors xl:table-cell sm:pr-5 lg:pr-6',
                            'line-clamp-2',
                            cellSurface,
                          )}
                          title={item.analyst_rating || undefined}
                        >
                          {item.analyst_rating || '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {!board.isLoading && !(board.data?.data.items.length ?? 0) ? (
              <p className="px-3 py-10 text-sm text-muted-foreground sm:px-5 lg:px-6">
                {t('empty')}
              </p>
            ) : null}
          </div>
        </div>
      </PageFrame>
    </AppShell>
  );
}
