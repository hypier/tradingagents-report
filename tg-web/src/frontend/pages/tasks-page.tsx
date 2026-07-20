import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { PipelinePanel } from '../components/dashboard/pipeline-panel';
import { ReportsTable } from '../components/dashboard/recent-reports';
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
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-3.5 lg:px-6">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">
                {t('title')}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('subtitle')}{' '}
                <Link
                  className="text-foreground underline-offset-2 hover:underline"
                  to="/reports"
                >
                  {t('reportsLink')}
                </Link>
              </p>
            </div>
            <div
              className="flex flex-wrap gap-0 border-b border-border"
              role="tablist"
              aria-label={t('statusFilter')}
            >
              {statusValues.map((value) => {
                const activeFilter = status === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={activeFilter}
                    className={cn(
                      '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
                      activeFilter
                        ? 'border-primary font-semibold text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => setStatus(value)}
                  >
                    {value === 'all'
                      ? t('common:status.all')
                      : t(`common:status.${value}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
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

        <aside className="flex w-full min-h-0 shrink-0 flex-col border-t border-border bg-muted/15 lg:w-[min(100%,22rem)] lg:border-t-0 xl:w-[24rem]">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PipelinePanel
              variant="rail"
              job={active}
              events={events.data?.data}
              loading={events.isLoading}
            />
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
