import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FileText, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ReportsTable } from '../components/dashboard/recent-reports';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
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
import {
  getMarketIdentities,
  listResearch,
  type AnalysisStatus,
} from '../lib/research';

const pageSize = 50;
const statusValues: Array<AnalysisStatus | 'all'> = [
  'all',
  'queued',
  'running',
  'succeeded',
  'failed',
];

export function ReportsPage() {
  const { t } = useTranslation(['reports', 'common']);
  const navigate = useNavigate();
  const [status, setStatus] = useState<AnalysisStatus | 'all'>('all');
  const [ticker, setTicker] = useState('');
  const [exchange, setExchange] = useState('');
  const [tradeDateFrom, setTradeDateFrom] = useState('');
  const [tradeDateTo, setTradeDateTo] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const statusFilter = status === 'all' ? undefined : status;
  const filters = {
    status: statusFilter,
    ticker: ticker.trim() || undefined,
    exchange: exchange.trim() || undefined,
    tradeDateFrom: tradeDateFrom || undefined,
    tradeDateTo: tradeDateTo || undefined,
    favorite: favoriteOnly || undefined,
    archived: includeArchived ? undefined : false,
  };
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
  const identities = useQuery({
    queryKey: ['report-library-identities', jobs.map((job) => job.ticker)],
    queryFn: () => getMarketIdentities(jobs.map((job) => job.ticker)),
    enabled: jobs.length > 0,
  });
  const identitiesByTicker = Object.fromEntries(
    (identities.data?.data ?? []).map((identity) => [
      identity.ticker,
      identity,
    ]),
  );

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col px-4 py-6 lg:px-6">
        <div className="flex w-full flex-1 flex-col gap-6">
          <section className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <FileText className="size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">
                  {t('eyebrow')}
                </p>
                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  {t('title')}
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {t('subtitle')}
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-3 rounded-xl border bg-card/60 p-4 md:grid-cols-2 xl:grid-cols-4">
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
                checked={favoriteOnly}
                onCheckedChange={(checked) => setFavoriteOnly(checked === true)}
              />
              {t('favoriteOnly')}
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
          </section>

          <ReportsTable
            jobs={jobs}
            loading={reports.isLoading}
            error={reports.isError && jobs.length === 0}
            identities={identitiesByTicker}
            onOpenReport={(id) => navigate(`/reports/${id}`)}
            title={t('library.title')}
            description={t('library.description')}
            titleId="report-library-title"
          />

          {reports.isError && jobs.length > 0 ? (
            <Alert variant="destructive">
              <AlertTitle>{t('loadMoreErrorTitle')}</AlertTitle>
              <AlertDescription>{t('loadMoreErrorBody')}</AlertDescription>
            </Alert>
          ) : null}

          {reports.hasNextPage ? (
            <div className="flex justify-center">
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
                {reports.isFetchingNextPage
                  ? t('loadingMore')
                  : t('loadMore')}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
