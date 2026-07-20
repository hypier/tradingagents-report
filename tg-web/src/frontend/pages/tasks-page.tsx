import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { PipelinePanel } from '../components/dashboard/pipeline-panel';
import { ReportsTable } from '../components/dashboard/recent-reports';
import { Button } from '../components/ui/button';
import {
  getMarketIdentities,
  getResearchEvents,
  listResearch,
  type AnalysisStatus,
} from '../lib/research';
import { cn } from '../lib/utils';

const statusValues: Array<AnalysisStatus | 'all'> = [
  'all',
  'queued',
  'running',
  'succeeded',
  'failed',
];

export function TasksPage() {
  const { t } = useTranslation(['tasks', 'common']);
  const navigate = useNavigate();
  const [status, setStatus] = useState<AnalysisStatus | 'all'>('all');
  const statusFilter = status === 'all' ? undefined : status;
  const jobs = useQuery({
    queryKey: ['tasks', statusFilter],
    queryFn: () =>
      listResearch({
        limit: 50,
        status: statusFilter,
      }),
    refetchInterval: (query) =>
      query.state.data?.data.some(
        (job) => job.status === 'queued' || job.status === 'running',
      )
        ? 5_000
        : false,
  });
  const active = jobs.data?.data.find(
    (job) => job.status === 'queued' || job.status === 'running',
  );
  const events = useQuery({
    queryKey: ['analysis-events', active?.id],
    queryFn: () => getResearchEvents(active!.id),
    enabled: Boolean(active),
    refetchInterval: active ? 5_000 : false,
  });
  const identities = useQuery({
    queryKey: [
      'task-identities',
      (jobs.data?.data ?? []).map((job) => job.ticker),
    ],
    queryFn: () =>
      getMarketIdentities((jobs.data?.data ?? []).map((job) => job.ticker)),
    enabled: (jobs.data?.data.length ?? 0) > 0,
  });
  const identitiesByTicker = Object.fromEntries(
    (identities.data?.data ?? []).map((identity) => [
      identity.ticker,
      identity,
    ]),
  );

  return (
    <AppShell>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col border-border lg:border-r">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-5 py-4 lg:px-6">
            <div className="min-w-0">
              <p className="font-label-caps text-primary">
                {t('eyebrow')}
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
                {t('title')}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground md:text-base">
                {t('subtitle')}{' '}
                <Link className="underline" to="/reports">
                  {t('reportsLink')}
                </Link>
              </p>
            </div>
            <div
              className="flex flex-wrap gap-1 rounded-none border border-border p-1"
              role="group"
              aria-label={t('statusFilter')}
            >
              {statusValues.map((value) => {
                const activeFilter = status === value;
                return (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={activeFilter ? 'default' : 'ghost'}
                    className={cn(
                      'h-9 px-3 text-sm',
                      activeFilter && 'font-semibold',
                    )}
                    onClick={() => setStatus(value)}
                  >
                    {value === 'all'
                      ? t('common:status.all')
                      : t(`common:status.${value}`)}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
            <ReportsTable
              jobs={jobs.data?.data ?? []}
              loading={jobs.isLoading}
              error={jobs.isError}
              identities={identitiesByTicker}
              onOpenReport={(id) => navigate(`/reports/${id}`)}
              title={t('library.title')}
              description={t('library.description')}
              titleId="task-library-title"
            />
          </div>
        </section>

        <aside className="flex w-full shrink-0 flex-col border-t border-border bg-muted/20 lg:w-[min(100%,22rem)] lg:border-t-0 xl:w-[24rem]">
          <PipelinePanel
            variant="rail"
            job={active}
            events={events.data?.data}
            loading={events.isLoading}
          />
        </aside>
      </div>
    </AppShell>
  );
}
