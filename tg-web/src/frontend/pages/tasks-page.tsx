import { useQuery } from '@tanstack/react-query';
import { ListTodo } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { AppShell } from '../components/app-shell';
import { PipelinePanel } from '../components/dashboard/pipeline-panel';
import { ReportsTable } from '../components/dashboard/recent-reports';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  getMarketIdentities,
  getResearchEvents,
  listResearch,
  type AnalysisStatus,
} from '../lib/research';

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
      <div className="flex flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
        <section className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <ListTodo className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">
                {t('eyebrow')}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">
                {t('title')}
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t('subtitle')}{' '}
                <Link className="underline" to="/reports">
                  {t('reportsLink')}
                </Link>
              </p>
            </div>
          </div>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as AnalysisStatus | 'all')}
          >
            <SelectTrigger className="w-40" aria-label={t('statusFilter')}>
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
        </section>

        <PipelinePanel
          job={active}
          events={events.data?.data}
          loading={events.isLoading}
        />

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
    </AppShell>
  );
}
