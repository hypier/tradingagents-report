import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { PipelinePanel } from '../components/dashboard/pipeline-panel';
import { ReportsTable } from '../components/dashboard/recent-reports';
import {
  getResearchEvents,
  listResearch,
  type AnalysisJob,
  type AnalysisStatus,
} from '../lib/research';
import { useJobMarketIdentities } from '../hooks/use-market-identities';
import { cn } from '../lib/utils';

const statusValues: Array<AnalysisStatus | 'all'> = [
  'all',
  'queued',
  'running',
  'succeeded',
  'failed',
];

function sortJobsForTasks(jobs: AnalysisJob[]) {
  return [...jobs].sort((a, b) => {
    const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    return bTime - aTime;
  });
}

export function TasksPage() {
  const { t } = useTranslation(['tasks', 'common']);
  const navigate = useNavigate();
  const [status, setStatus] = useState<AnalysisStatus | 'all'>('running');
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
  const sortedJobs = useMemo(
    () => sortJobsForTasks(jobs.data?.data ?? []),
    [jobs.data?.data],
  );
  const { identities } = useJobMarketIdentities(sortedJobs);
  const activeInView = sortedJobs.find(
    (job) => job.status === 'queued' || job.status === 'running',
  );
  // When browsing history tabs, probe for a live job so the rail can still open.
  const needsLiveProbe =
    statusFilter === 'succeeded' || statusFilter === 'failed';
  const liveProbe = useQuery({
    queryKey: ['tasks-live'],
    queryFn: async () => {
      const [running, queued] = await Promise.all([
        listResearch({ limit: 1, status: 'running' }),
        listResearch({ limit: 1, status: 'queued' }),
      ]);
      return [...running.data, ...queued.data];
    },
    enabled: needsLiveProbe,
    refetchInterval: needsLiveProbe ? 5_000 : false,
  });
  const active =
    activeInView ??
    liveProbe.data?.find(
      (job) => job.status === 'queued' || job.status === 'running',
    );
  const showPipeline = Boolean(active);
  const events = useQuery({
    queryKey: ['analysis-events', active?.id],
    queryFn: () => getResearchEvents(active!.id),
    enabled: showPipeline,
    refetchInterval: showPipeline ? 5_000 : false,
  });
  return (
    <AppShell>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col border-border',
            showPipeline && 'lg:border-r',
          )}
        >
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
              jobs={sortedJobs}
              loading={jobs.isLoading}
              error={jobs.isError}
              identities={identities}
              onOpenReport={(id) => navigate(`/reports/${id}`)}
              title={t('library.title')}
              description={t('library.description')}
              titleId="task-library-title"
              variant="tasks"
              hideSectionHeader
            />
          </div>
        </section>

        {showPipeline ? (
          <aside className="flex w-full min-h-0 shrink-0 flex-col border-t border-border bg-muted/15 lg:w-[min(100%,22rem)] lg:border-t-0 xl:w-[24rem]">
            <PipelinePanel
              variant="rail"
              className="min-h-0 flex-1"
              job={active}
              events={events.data?.data}
              loading={events.isLoading}
            />
          </aside>
        ) : null}
      </div>
    </AppShell>
  );
}
