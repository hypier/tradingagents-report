import {
  Check,
  CircleDashed,
  LoaderCircle,
  ScrollText,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '../ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../ui/empty';
import { Progress } from '../ui/progress';
import { ScrollArea } from '../ui/scroll-area';
import { Skeleton } from '../ui/skeleton';
import { getStageIcon, Workflow } from '../icons/research-icons';
import { formatLocaleTime } from '@/frontend/lib/format-locale';
import { localizeProgressMessage } from '@/frontend/lib/localize-progress-message';
import { cn } from '@/frontend/lib/utils';
import type { AnalysisEvent, AnalysisJob } from '../../lib/research';

const analystStages = ['market', 'fundamentals', 'news', 'social'];
const finalStages = [
  'research_debate',
  'trader',
  'risk_review',
  'final_synthesis',
];
const knownStageKeys = new Set([...analystStages, ...finalStages]);

function stageFromProgressMessage(value?: string | null) {
  const message = value?.toLowerCase() ?? '';
  if (message.includes('market analyst')) return 'market';
  if (message.includes('fundamentals analyst')) return 'fundamentals';
  if (message.includes('news analyst')) return 'news';
  if (message.includes('sentiment analyst')) return 'social';
  if (message.includes('research debate')) return 'research_debate';
  if (message.includes('trader')) return 'trader';
  if (message.includes('risk debate')) return 'risk_review';
  if (message.includes('portfolio manager')) return 'final_synthesis';
  return undefined;
}

function jobStatusVariant(status?: AnalysisJob['status']) {
  if (status === 'failed') return 'destructive';
  if (status === 'running' || status === 'queued') return 'running';
  if (status === 'succeeded') return 'up';
  return 'secondary';
}

export function PipelinePanel({
  job,
  events,
  loading,
  variant = 'full',
}: {
  job?: AnalysisJob;
  events?: AnalysisEvent[];
  loading?: boolean;
  /** full = wide desk card; rail = compact right-column activity */
  variant?: 'full' | 'rail';
}) {
  const { t } = useTranslation(['home', 'common']);
  const stages = [...(job?.analysts ?? analystStages), ...finalStages];
  const activeStage = stageFromProgressMessage(job?.current_step);
  const activeIndex = activeStage ? stages.indexOf(activeStage) : -1;
  const CurrentStageIcon = getStageIcon(activeStage ?? 'market');

  function displayStage(value?: string | null) {
    if (!value) return t('common:stages.waiting');
    if (knownStageKeys.has(value)) {
      return t(`common:stages.${value}`);
    }
    return localizeProgressMessage(value, t);
  }

  function statusLabel(complete: boolean, current: boolean) {
    if (complete) return t('pipeline.complete');
    if (current) return t('pipeline.inProgress');
    return t('pipeline.pending');
  }

  const jobStatus = job?.status
    ? t(`common:status.${job.status}`, { defaultValue: job.status })
    : t('common:status.idle');
  const isLive = job?.status === 'running' || job?.status === 'queued';

  if (variant === 'rail') {
    return (
      <div className="flex min-h-0 flex-col border-b border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="inline-flex items-center gap-2 font-label-caps text-muted-foreground">
            <span
              className={cn(
                'size-2 rounded-full',
                isLive ? 'animate-pulse bg-primary' : 'bg-muted-foreground/50',
              )}
            />
            {t('pipeline.eyebrow')}
          </p>
          <Badge variant={jobStatusVariant(job?.status)} className="font-mono">
            {jobStatus}
          </Badge>
        </div>

        {job ? (
          <div className="space-y-3.5 px-4 py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-base font-semibold tracking-wide">
                  {job.ticker}
                </p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {displayStage(activeStage ?? job.current_step)}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                {job.progress_percent ?? 0}%
              </span>
            </div>
            <Progress value={job.progress_percent ?? 0} className="h-1.5" />
            {loading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ) : events?.length ? (
              <ol className="flex max-h-44 flex-col gap-2.5 overflow-y-auto border-l border-border pl-3.5">
                {[...events].slice(-6).reverse().map((event, index) => (
                  <li
                    key={`${event.time ?? 'event'}-${index}`}
                    className="relative text-sm leading-5 text-muted-foreground"
                  >
                    <span
                      className={cn(
                        'absolute top-1.5 -left-[15px] size-2 rounded-full',
                        index === 0 ? 'bg-primary' : 'bg-muted-foreground/50',
                      )}
                    />
                    <div className="flex items-baseline gap-2">
                      {event.time ? (
                        <time
                          dateTime={event.time}
                          className="shrink-0 font-mono text-xs tabular-nums"
                        >
                          {formatLocaleTime(event.time)}
                        </time>
                      ) : null}
                      <span className="min-w-0 break-words">
                        {localizeProgressMessage(event.message, t)}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('pipeline.noEventsBody')}
              </p>
            )}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t('pipeline.noEventsBody')}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card aria-labelledby="pipeline-title" className="@container/card">
      <CardHeader className="border-b">
        <CardDescription className="inline-flex items-center gap-1.5">
          <Workflow className="size-3.5" />
          {t('pipeline.eyebrow')}
        </CardDescription>
        <CardTitle>
          <h2 id="pipeline-title">{t('pipeline.title')}</h2>
        </CardTitle>
        <CardAction>
          <Badge variant={jobStatusVariant(job?.status)}>{jobStatus}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 pt-1 @5xl/card:grid-cols-[minmax(0,1fr)_minmax(240px,0.85fr)]">
        <div className="@container/stages flex flex-col gap-5">
          <div className="flex items-end justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <CurrentStageIcon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t('pipeline.currentStage')}
                </p>
                <p className="mt-1 truncate text-base font-medium">
                  {displayStage(activeStage ?? job?.current_step)}
                </p>
              </div>
            </div>
            <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
              {job?.progress_percent ?? 0}%
            </span>
          </div>
          <Progress value={job?.progress_percent ?? 0} className="h-1.5" />

          <ol className="grid grid-cols-[repeat(auto-fill,minmax(8.75rem,1fr))] gap-2">
            {stages.map((stage, index) => {
              const current =
                index === activeIndex && job?.status === 'running';
              const complete =
                activeIndex > index || job?.status === 'succeeded';
              const label = statusLabel(complete, current);
              const stageName = displayStage(stage);
              const StageIcon = getStageIcon(stage);
              return (
                <li
                  key={stage}
                  aria-label={t('pipeline.stageStatus', {
                    stage: stageName,
                    status: label,
                  })}
                  data-stage-status={label}
                  title={stageName}
                  className={cn(
                    'relative flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 transition-colors',
                    complete && 'border-primary/30 bg-primary/5',
                    current &&
                      'border-primary bg-primary/10 shadow-[0_0_0_1px] shadow-primary/20',
                    !complete && !current && 'bg-muted/20',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-md',
                      complete || current
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <StageIcon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'truncate text-sm leading-snug text-foreground',
                        current ? 'font-bold' : 'font-medium',
                      )}
                    >
                      {stageName}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                      {String(index + 1).padStart(2, '0')}
                    </p>
                  </div>
                  {complete ? (
                    <Check
                      className="size-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                  ) : current ? (
                    <LoaderCircle
                      className="size-3.5 shrink-0 animate-spin text-primary"
                      aria-hidden="true"
                    />
                  ) : (
                    <CircleDashed
                      className="size-3.5 shrink-0 text-muted-foreground/60"
                      aria-hidden="true"
                    />
                  )}
                  <span className="sr-only">{label}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="min-w-0 rounded-md border bg-muted/25 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium">
              <ScrollText className="size-3.5 text-muted-foreground" />
              {t('pipeline.eventLog')}
            </p>
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              {t('pipeline.latest')}
            </span>
          </div>
          {loading ? (
            <div className="mt-4 flex flex-col gap-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          ) : events?.length ? (
            <ScrollArea className="mt-4 h-56 pr-2">
              <ol className="flex flex-col gap-3 border-l border-border/80 py-0.5 pl-3 pr-2">
                {[...events].reverse().map((event, index) => (
                  <li
                    key={`${event.time ?? 'event'}-${index}`}
                    className="relative text-xs leading-5 text-muted-foreground"
                  >
                    <span className="absolute top-1.5 -left-[17px] size-1.5 rounded-full bg-primary/70" />
                    <div className="flex items-baseline gap-2">
                      {event.time ? (
                        <time
                          dateTime={event.time}
                          className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80"
                        >
                          {formatLocaleTime(event.time)}
                        </time>
                      ) : null}
                      <span className="min-w-0 break-words">
                        {localizeProgressMessage(event.message, t)}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </ScrollArea>
          ) : (
            <Empty className="min-h-48 p-4">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ScrollText />
                </EmptyMedia>
                <EmptyTitle>{t('pipeline.noEventsTitle')}</EmptyTitle>
                <EmptyDescription>
                  {t('pipeline.noEventsBody')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
