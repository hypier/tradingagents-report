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
import { PageFrame, PageToolbar } from '@/frontend/components/page-chrome';
import { TickerSearch } from '@/frontend/components/ticker-search';
import { Alert, AlertDescription, AlertTitle } from '@/frontend/components/ui/alert';
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
  formatLocaleDateTimeValue,
  formatLocaleNumber,
} from '@/frontend/lib/format-locale';
import type { SelectedInstrument } from '@/frontend/lib/research';
import { cn } from '@/frontend/lib/utils';
import { normalizeUiLocale } from '@/frontend/i18n/locales';
import {
  DEFAULT_TV_MARKET_CODE,
  displayNameForTvMarket,
  isKnownTvMarketCode,
  productMarketToTradingViewCode,
  STOCK_LEADERBOARD_TABS,
  type StockLeaderboardTab,
} from '@/shared/market-codes';

const BOARD_TABS = STOCK_LEADERBOARD_TABS;

function formatCompact(value?: number) {
  if (value === undefined) return '—';
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function changeClass(changePercent: number) {
  if (changePercent > 0) return 'text-market-up';
  if (changePercent < 0) return 'text-market-down';
  return 'text-muted-foreground';
}

function formatRatio(value?: number) {
  if (value === undefined) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPercentValue(value?: number) {
  if (value === undefined) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function QuotesPage() {
  const { t, i18n } = useTranslation(['quotes', 'common']);
  const navigate = useNavigate();
  const lang = normalizeUiLocale(i18n.language) === 'zh' ? 'zh' : 'en';
  const [marketCode, setMarketCode] = useState(DEFAULT_TV_MARKET_CODE);
  const [tab, setTab] = useState<StockLeaderboardTab>('active');
  const [searchInstrument, setSearchInstrument] =
    useState<SelectedInstrument | null>(null);
  const [defaultApplied, setDefaultApplied] = useState(false);

  const account = useQuery({
    queryKey: ['account-profile'],
    queryFn: () => getAccountProfile(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (defaultApplied) return;
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
        count: 20,
        lang,
      }),
    refetchInterval: 45_000,
  });

  const tapeUpdatedAt = tape.dataUpdatedAt;
  const boardUpdatedAt = board.dataUpdatedAt;

  const marketName =
    board.data?.data.marketName ||
    displayNameForTvMarket(marketCode, lang) ||
    marketCode;

  const summaryLine = useMemo(() => {
    const parts = [
      marketName,
      typeof board.data?.data.totalCount === 'number'
        ? t('summary.symbols', { count: board.data.data.totalCount })
        : null,
      board.data?.data.tabTitle || t(`tabs.${tab}`),
    ].filter(Boolean);
    return parts.join(' / ');
  }, [board.data, marketName, t, tab]);

  const freshnessLine = useMemo(() => {
    const stamp = Math.max(tapeUpdatedAt || 0, boardUpdatedAt || 0);
    if (!stamp) return null;
    return `${t('summary.source')} / ${t('summary.asOf', {
      time: formatLocaleDateTimeValue(stamp),
    })}`;
  }, [boardUpdatedAt, t, tapeUpdatedAt]);

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
          <span className="inline-flex items-center gap-2">
            <span
              className="live-pulse size-1.5 shrink-0 rounded-full bg-primary"
              aria-hidden
            />
            <span>{t('subtitle')}</span>
          </span>
        }
        actions={
          <div className="w-full min-w-0 sm:w-80 sm:max-w-sm">
            <TickerSearch
              value={searchInstrument}
              onChange={onSearchSelect}
            />
          </div>
        }
        toolbar={
          <PageToolbar className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
            <MarketCodePicker
              value={marketCode}
              onChange={setMarketCode}
              className="w-full sm:w-64 sm:shrink-0"
            />
            <div className="min-w-0 space-y-0.5 sm:max-w-[min(100%,28rem)] sm:text-right">
              <p className="truncate font-mono text-xs tracking-wide text-muted-foreground">
                {summaryLine}
              </p>
              {freshnessLine ? (
                <p className="truncate font-mono text-[11px] tracking-wide text-muted-foreground/80">
                  {freshnessLine}
                </p>
              ) : null}
            </div>
          </PageToolbar>
        }
        bodyClassName="gap-0 p-0 px-0 py-0 lg:px-0 lg:py-0"
      >
        {tape.isLoading ? (
          <div className="flex h-8 items-center gap-4 overflow-hidden border-b border-border px-3 sm:gap-6 sm:px-0">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-28 shrink-0 rounded-none" />
            ))}
          </div>
        ) : (
          <TickerTape
            items={tape.data?.data.tape ?? []}
            updatedAt={tapeUpdatedAt}
          />
        )}

        <div className="flex min-h-0 flex-1 flex-col px-3 pt-3 sm:px-5 lg:px-6 lg:pt-4">
          {tape.isLoading ? (
            <div className="-mx-3 grid grid-cols-2 border-y border-border sm:-mx-5 lg:-mx-6 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex h-[4.75rem] flex-col justify-center gap-2 px-3 sm:px-4 lg:h-[4.25rem] lg:flex-row lg:items-center lg:gap-3',
                    index % 2 === 1 && 'border-l border-border',
                    index >= 2 && 'border-t border-border lg:border-t-0',
                    index > 0 && 'lg:border-l lg:border-border',
                  )}
                >
                  <Skeleton className="size-8 rounded-none" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3 w-20 rounded-none" />
                    <Skeleton className="h-3 w-14 rounded-none" />
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

          <div className="-mx-3 border-b border-border sm:-mx-5 lg:-mx-6">
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

          <div className="-mx-3 min-h-0 flex-1 overflow-auto sm:-mx-5 lg:-mx-6">
            {board.isLoading ? (
              <div className="space-y-0 px-3 sm:px-5 lg:px-6">
                {Array.from({ length: 10 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex h-11 items-center gap-3 border-b border-border"
                  >
                    <Skeleton className="size-8 rounded-none" />
                    <Skeleton className="h-4 w-40 rounded-none" />
                    <Skeleton className="ml-auto h-4 w-16 rounded-none" />
                  </div>
                ))}
              </div>
            ) : (
              <Table
                className="w-full min-w-[32rem] xl:min-w-[68rem]"
                containerClassName="overflow-visible"
              >
                <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-border">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky left-0 z-20 w-12 bg-background pl-3 font-mono text-xs tracking-wide text-muted-foreground sm:w-14 sm:pl-5 lg:pl-6">
                      {t('columns.rank')}
                    </TableHead>
                    <TableHead className="sticky left-12 z-20 w-[7.5rem] max-w-[7.5rem] bg-background font-mono text-xs tracking-wide text-muted-foreground sm:left-14 sm:w-auto sm:max-w-none sm:min-w-[11rem] md:min-w-[13rem]">
                      {t('columns.asset')}
                    </TableHead>
                    <TableHead className="bg-background text-right font-mono text-xs tracking-wide text-muted-foreground">
                      {t('columns.last')}
                    </TableHead>
                    <TableHead className="bg-background text-right font-mono text-xs tracking-wide text-muted-foreground">
                      {t('columns.change')}
                    </TableHead>
                    <TableHead className="hidden bg-background text-right font-mono text-xs tracking-wide text-muted-foreground md:table-cell">
                      {t('columns.volume')}
                    </TableHead>
                    <TableHead className="hidden bg-background text-right font-mono text-xs tracking-wide text-muted-foreground md:table-cell">
                      {t('columns.relVol')}
                    </TableHead>
                    <TableHead className="hidden bg-background text-right font-mono text-xs tracking-wide text-muted-foreground lg:table-cell">
                      {t('columns.mktCap')}
                    </TableHead>
                    <TableHead className="hidden bg-background text-right font-mono text-xs tracking-wide text-muted-foreground lg:table-cell">
                      {t('columns.pe')}
                    </TableHead>
                    <TableHead className="hidden bg-background text-right font-mono text-xs tracking-wide text-muted-foreground xl:table-cell">
                      {t('columns.eps')}
                    </TableHead>
                    <TableHead className="hidden bg-background text-right font-mono text-xs tracking-wide text-muted-foreground xl:table-cell">
                      {t('columns.epsGrowth')}
                    </TableHead>
                    <TableHead className="hidden bg-background text-right font-mono text-xs tracking-wide text-muted-foreground xl:table-cell">
                      {t('columns.divYield')}
                    </TableHead>
                    <TableHead className="hidden bg-background font-mono text-xs tracking-wide text-muted-foreground lg:table-cell">
                      {t('columns.sector')}
                    </TableHead>
                    <TableHead className="hidden bg-background pr-3 text-right font-mono text-xs tracking-wide text-muted-foreground xl:table-cell sm:pr-5 lg:pr-6">
                      {t('columns.analyst')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(board.data?.data.items ?? []).map((item, rowIndex) => {
                    const changeLabel = `${item.change_percent >= 0 ? '+' : ''}${item.change_percent.toFixed(2)}%`;
                    const zebra =
                      rowIndex % 2 === 1
                        ? 'bg-[rgba(148,163,184,0.04)]'
                        : 'bg-background';
                    return (
                      <TableRow
                        key={item.symbol}
                        className={cn(
                          'h-11',
                          item.linkable && 'cursor-pointer',
                          zebra,
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
                            'sticky left-0 z-10 pl-3 font-mono text-xs tabular-nums text-muted-foreground sm:pl-5 lg:pl-6',
                            zebra,
                          )}
                        >
                          {item.rank || '—'}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'sticky left-12 z-10 w-[7.5rem] max-w-[7.5rem] sm:left-14 sm:w-auto sm:max-w-none',
                            zebra,
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
                            <InstrumentLogo
                              symbol={item.symbol}
                              logoUrl={item.logo_url}
                              size="sm"
                              className="sm:size-8"
                            />
                            <InstrumentIdentity
                              name={item.description}
                              ticker={item.name}
                              density="compact"
                              className="min-w-0 flex-1"
                              nameClassName="max-w-full text-xs sm:text-sm"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatLocaleNumber(item.price)}
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            {item.currency}
                          </span>
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-mono text-sm tabular-nums',
                            changeClass(item.change_percent),
                          )}
                        >
                          {changeLabel}
                        </TableCell>
                        <TableCell className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground md:table-cell">
                          {formatCompact(item.volume)}
                        </TableCell>
                        <TableCell className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground md:table-cell">
                          {item.relative_volume !== undefined
                            ? item.relative_volume.toFixed(2)
                            : '—'}
                        </TableCell>
                        <TableCell className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground lg:table-cell">
                          {formatCompact(item.market_cap)}
                        </TableCell>
                        <TableCell className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground lg:table-cell">
                          {formatRatio(item.pe_ratio)}
                        </TableCell>
                        <TableCell className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground xl:table-cell">
                          {formatRatio(item.eps_diluted)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'hidden text-right font-mono text-xs tabular-nums xl:table-cell',
                            item.eps_diluted_growth !== undefined
                              ? changeClass(item.eps_diluted_growth)
                              : 'text-muted-foreground',
                          )}
                        >
                          {formatPercentValue(item.eps_diluted_growth)}
                        </TableCell>
                        <TableCell className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground xl:table-cell">
                          {item.dividend_yield !== undefined
                            ? `${item.dividend_yield.toFixed(2)}%`
                            : '—'}
                        </TableCell>
                        <TableCell className="hidden max-w-[10rem] truncate text-xs text-muted-foreground lg:table-cell">
                          {item.sector || '—'}
                        </TableCell>
                        <TableCell className="hidden pr-3 text-right font-mono text-xs text-muted-foreground xl:table-cell sm:pr-5 lg:pr-6">
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
