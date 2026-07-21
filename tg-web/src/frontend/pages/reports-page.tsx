import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ChevronDown, Layers, List, LoaderCircle, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ReportsTable } from '../components/dashboard/recent-reports';
import { ReportsByTicker } from '../components/dashboard/reports-by-ticker';
import { PageFrame, PageToolbar } from '../components/page-chrome';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Spinner } from '../components/ui/spinner';
import { listResearch, type AnalysisStatus } from '../lib/research';
import { useJobMarketIdentities } from '../hooks/use-market-identities';
import { cn } from '../lib/utils';

const pageSize = 50;
const statusValues: Array<AnalysisStatus | 'all'> = [
  'all',
  'succeeded',
  'failed',
];

type LibraryView = 'list' | 'byTicker';

export function ReportsPage() {
  const { t } = useTranslation(['reports', 'common']);
  const navigate = useNavigate();
  const [view, setView] = useState<LibraryView>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [status, setStatus] = useState<AnalysisStatus | 'all'>('succeeded');
  const [ticker, setTicker] = useState('');
  const [exchange, setExchange] = useState('');
  const [tradeDateFrom, setTradeDateFrom] = useState('');
  const [tradeDateTo, setTradeDateTo] = useState('');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const statusFilter = status === 'all' ? undefined : status;
  const filters = {
    status: statusFilter,
    ticker: ticker.trim() || undefined,
    exchange: exchange.trim() || undefined,
    tradeDateFrom: tradeDateFrom || undefined,
    tradeDateTo: tradeDateTo || undefined,
    watchlist: watchlistOnly || undefined,
    archived: includeArchived ? undefined : false,
  };
  const activeFilterCount = [
    status !== 'succeeded',
    Boolean(ticker.trim()),
    Boolean(exchange.trim()),
    Boolean(tradeDateFrom),
    Boolean(tradeDateTo),
    watchlistOnly,
    includeArchived,
  ].filter(Boolean).length;
  const reports = useInfiniteQuery({
    queryKey: ['report-library', filters],
    queryFn: ({ pageParam }) =>
      listResearch({
        limit: pageSize,
        offset: pageParam,
        ...filters,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.data.length === pageSize
        ? pages.reduce((total, page) => total + page.data.length, 0)
        : undefined,
  });
  const jobs = reports.data?.pages.flatMap((page) => page.data) ?? [];
  const { identities } = useJobMarketIdentities(jobs);

  return (
    <PageFrame
      title={t('title')}
      description={t('subtitle')}
      bodyClassName="gap-0 p-0"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex border border-border"
            role="tablist"
            aria-label={t('view.label')}
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'list'}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 px-2.5 text-sm transition-colors',
                view === 'list'
                  ? 'bg-primary/15 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
              onClick={() => setView('list')}
            >
              <List className="size-3.5" />
              {t('view.list')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'byTicker'}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 border-l border-border px-2.5 text-sm transition-colors',
                view === 'byTicker'
                  ? 'bg-primary/15 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
              onClick={() => setView('byTicker')}
            >
              <Layers className="size-3.5" />
              {t('view.byTicker')}
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <Search data-icon="inline-start" />
            {filtersOpen ? t('filtersHide') : t('filtersShow')}
            {activeFilterCount > 0 ? (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 justify-center px-1.5 font-mono text-[11px] tabular-nums"
              >
                {activeFilterCount}
              </Badge>
            ) : null}
            <ChevronDown
              data-icon="inline-end"
              className={cn(
                'transition-transform',
                filtersOpen && 'rotate-180',
              )}
            />
          </Button>
        </div>
      }
      toolbar={
        filtersOpen ? (
          <PageToolbar className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              {t('statusFilter')}
              <Select
                value={status}
                onValueChange={(value) =>
                  setStatus(value as AnalysisStatus | 'all')
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statusValues.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === 'all'
                          ? t('common:status.all')
                          : t(`common:status.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              {t('tickerFilter')}
              <Input
                value={ticker}
                onChange={(event) => setTicker(event.target.value)}
                placeholder={t('tickerPlaceholder')}
                className="font-mono"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              {t('exchangeFilter')}
              <Input
                value={exchange}
                onChange={(event) => setExchange(event.target.value)}
                placeholder={t('exchangePlaceholder')}
                className="font-mono uppercase"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                {t('dateFrom')}
                <Input
                  type="date"
                  value={tradeDateFrom}
                  onChange={(event) => setTradeDateFrom(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                {t('dateTo')}
                <Input
                  type="date"
                  value={tradeDateTo}
                  onChange={(event) => setTradeDateTo(event.target.value)}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={watchlistOnly}
                onCheckedChange={(checked) =>
                  setWatchlistOnly(checked === true)
                }
              />
              {t('watchlistOnly')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={includeArchived}
                onCheckedChange={(checked) =>
                  setIncludeArchived(checked === true)
                }
              />
              {t('includeArchived')}
            </label>
          </PageToolbar>
        ) : null
      }
    >
      {view === 'list' ? (
        <ReportsTable
          jobs={jobs}
          loading={reports.isLoading}
          error={reports.isError && jobs.length === 0}
          identities={identities}
          onOpenReport={(id) => navigate(`/reports/${id}`)}
          title={t('library.title')}
          description={t('library.description')}
          titleId="report-library-title"
          variant="library"
          hideSectionHeader
        />
      ) : (
        <ReportsByTicker
          jobs={jobs}
          loading={reports.isLoading}
          error={reports.isError && jobs.length === 0}
          identities={identities}
          onOpenReport={(id) => navigate(`/reports/${id}`)}
        />
      )}

      {reports.isError && jobs.length > 0 ? (
        <div className="px-5 py-4 lg:px-6">
          <Alert variant="destructive">
            <AlertTitle>{t('loadMoreErrorTitle')}</AlertTitle>
            <AlertDescription>{t('loadMoreErrorBody')}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {reports.hasNextPage ? (
        <div className="flex justify-center border-t border-border px-5 py-4 lg:px-6">
          <Button
            variant="outline"
            onClick={() => reports.fetchNextPage()}
            disabled={reports.isFetchingNextPage}
          >
            {reports.isFetchingNextPage ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <LoaderCircle data-icon="inline-start" />
            )}
            {reports.isFetchingNextPage ? t('loadingMore') : t('loadMore')}
          </Button>
        </div>
      ) : null}
    </PageFrame>
  );
}
