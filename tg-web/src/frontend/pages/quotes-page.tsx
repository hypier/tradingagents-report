import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

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
          <div className="w-full min-w-[16rem] max-w-sm sm:w-80">
            <TickerSearch
              value={searchInstrument}
              onChange={onSearchSelect}
            />
          </div>
        }
        toolbar={
          <PageToolbar className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <MarketCodePicker
              value={marketCode}
              onChange={setMarketCode}
              className="w-full sm:w-64"
            />
            <div className="min-w-0 space-y-0.5 sm:text-right">
              <p className="font-mono text-xs tracking-wide text-muted-foreground">
                {summaryLine}
              </p>
              {freshnessLine ? (
                <p className="font-mono text-[11px] tracking-wide text-muted-foreground/80">
                  {freshnessLine}
                </p>
              ) : null}
            </div>
          </PageToolbar>
        }
        bodyClassName="gap-0 p-0 px-0 py-0 lg:px-0 lg:py-0"
      >
        {tape.isLoading ? (
          <div className="flex h-8 items-center gap-6 border-b border-border">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-28 rounded-none" />
            ))}
          </div>
        ) : (
          <TickerTape
            items={tape.data?.data.tape ?? []}
            updatedAt={tapeUpdatedAt}
          />
        )}

        <div className="flex min-h-0 flex-1 flex-col px-5 pt-3 lg:px-6 lg:pt-4">
          {tape.isLoading ? (
            <div className="grid grid-cols-2 border-y border-border sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex h-[4.25rem] items-center gap-3 px-4',
                    index > 0 && 'border-l border-border',
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

          <div className="border-b border-border">
            {(tape.isError || board.isError) && (
              <div className="py-3">
                <Alert variant="destructive">
                  <AlertTitle>{t('errors.loadTitle')}</AlertTitle>
                  <AlertDescription>{t('errors.loadBody')}</AlertDescription>
                </Alert>
              </div>
            )}
            <div className="-mx-1 flex flex-wrap gap-0">
              {BOARD_TABS.map((boardTab) => (
                <button
                  key={boardTab}
                  type="button"
                  className={cn(
                    'cursor-pointer border-b-2 px-3.5 py-3.5 text-sm transition-colors',
                    tab === boardTab
                      ? 'border-primary font-semibold text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setTab(boardTab)}
                >
                  {t(`tabs.${boardTab}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {board.isLoading ? (
              <div className="space-y-0">
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
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-border">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-14 bg-background font-mono text-xs tracking-wide text-muted-foreground">
                      {t('columns.rank')}
                    </TableHead>
                    <TableHead className="bg-background font-mono text-xs tracking-wide text-muted-foreground">
                      {t('columns.asset')}
                    </TableHead>
                    <TableHead className="bg-background text-right font-mono text-xs tracking-wide text-muted-foreground">
                      {t('columns.last')}
                    </TableHead>
                    <TableHead className="bg-background text-right font-mono text-xs tracking-wide text-muted-foreground">
                      {t('columns.change')}
                    </TableHead>
                    <TableHead className="bg-background text-right font-mono text-xs tracking-wide text-muted-foreground">
                      {t('columns.volume')}
                    </TableHead>
                    <TableHead className="hidden bg-background text-right font-mono text-xs tracking-wide text-muted-foreground md:table-cell">
                      {t('columns.relVol')}
                    </TableHead>
                    <TableHead className="hidden bg-background text-right font-mono text-xs tracking-wide text-muted-foreground lg:table-cell">
                      {t('columns.mktCap')}
                    </TableHead>
                    <TableHead className="hidden bg-background text-right font-mono text-xs tracking-wide text-muted-foreground xl:table-cell">
                      {t('columns.analyst')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(board.data?.data.items ?? []).map((item, rowIndex) => {
                    const changeLabel = `${item.change_percent >= 0 ? '+' : ''}${item.change_percent.toFixed(2)}%`;
                    return (
                      <TableRow
                        key={item.symbol}
                        className={cn(
                          'h-11',
                          item.linkable && 'cursor-pointer',
                          rowIndex % 2 === 1 && 'bg-[rgba(148,163,184,0.04)]',
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
                        <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                          {item.rank || '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <InstrumentLogo
                              symbol={item.symbol}
                              logoUrl={item.logo_url}
                              size="md"
                            />
                            <InstrumentIdentity
                              name={item.description}
                              ticker={item.name}
                              density="compact"
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
                        <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
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
                        <TableCell className="hidden text-right font-mono text-xs text-muted-foreground xl:table-cell">
                          {item.analyst_rating || '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {!board.isLoading && !(board.data?.data.items.length ?? 0) ? (
              <p className="py-10 text-sm text-muted-foreground">
                {t('empty')}
              </p>
            ) : null}
          </div>
        </div>
      </PageFrame>
    </AppShell>
  );
}
