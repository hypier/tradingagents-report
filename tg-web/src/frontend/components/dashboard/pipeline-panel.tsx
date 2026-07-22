import {
  Check,
  CircleDashed,
  FileText,
  LoaderCircle,
  RotateCcw,
  ScrollText,
  Square,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Progress } from '../ui/progress';
import { ScrollArea } from '../ui/scroll-area';
import { Skeleton } from '../ui/skeleton';
import { Spinner } from '../ui/spinner';
import { InstrumentLogo } from '../instrument-logo';
import { getStageIcon } from '../icons/research-icons';
import { formatLocaleTime } from '@/frontend/lib/format-locale';
import { localizeProgressMessage } from '@/frontend/lib/localize-progress-message';
import { cn } from '@/frontend/lib/utils';
import {
  displayAnalysisStatus,
  isCancelledAnalysis,
  type AnalysisDisplayStatus,
  type AnalysisEvent,
  type AnalysisJob,
} from '../../lib/research';

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

function jobStatusVariant(status?: AnalysisDisplayStatus) {
  if (status === 'failed') return 'destructive';
  if (status === 'running' || status === 'queued' || status === 'stopping') {
    return 'running';
  }
  if (status === 'succeeded') return 'up';
  return 'secondary';
}

export function PipelinePanel({
  job,
  events,
  loading,
  variant = 'full',
  className,
  onStop,
  stopping,
  onViewReport,
  onAnalyzeAgain,
}: {
  job?: AnalysisJob;
  events?: AnalysisEvent[];
  loading?: boolean;
  /** full = main-area stage grid + event log; rail = compact right-column */
  variant?: 'full' | 'rail';
  className?: string;
  onStop?: () => void;
  stopping?: boolean;
  onViewReport?: () => void;
  onAnalyzeAgain?: () => void;
}) {
  const { t } = useTranslation(['home', 'common']);
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  const stages = [...(job?.analysts ?? analystStages), ...finalStages];
  const activeStage = stageFromProgressMessage(job?.current_step);
  const activeIndex = activeStage ? stages.indexOf(activeStage) : -1;
  const CurrentStageIcon = getStageIcon(activeStage ?? 'market');
  const displayName = job?.display?.display_name?.trim() || job?.ticker;
  const showTickerUnderName = Boolean(
    job?.display?.display_name?.trim() && job?.ticker,
  );
  const logoUrl = job?.display?.logo_url?.trim() || undefined;

  function displayStage(value?: string | null) {
    if (!value) return t('common:stages.waiting');
    if (knownStageKeys.has(value)) {
      return t(`common:stages.${value}`);
    }
    return localizeProgressMessage(value, t);
  }

  function stageDescription(stage: string) {
    if (analystStages.includes(stage)) {
      return t(`analysts.${stage}.description`);
    }
    return t(`pipeline.stageDescriptions.${stage}`, { defaultValue: '' });
  }

  function statusLabel(complete: boolean, current: boolean) {
    if (complete) return t('pipeline.complete');
    if (current) return t('pipeline.inProgress');
    return t('pipeline.pending');
  }

  const displayStatus = displayAnalysisStatus(job, { stopping });
  const jobStatus = displayStatus
    ? t(`common:status.${displayStatus}`, { defaultValue: displayStatus })
    : t('common:status.idle');
  const isLive = job?.status === 'running' || job?.status === 'queued';
  const canStop =
    Boolean(onStop) &&
    isLive &&
    Boolean(job?.id) &&
    job.id !== 'pending-submit';
  const isFinished =
    job?.status === 'succeeded' || job?.status === 'failed';
  const cancelled = isCancelledAnalysis(job);
  const showResultActions =
    isFinished &&
    Boolean(onAnalyzeAgain) &&
    Boolean(job?.id) &&
    job.id !== 'pending-submit';
  const timelineEvents = (() => {
    const list = [...(events ?? [])];
    const hasStopRequested = list.some(
      (event) => event.message === 'Stop requested',
    );
    const hasCancelled = list.some((event) => event.message === 'Cancelled');
    if (stopping && !cancelled && !hasStopRequested) {
      list.push({
        kind: 'stage',
        message: 'Stop requested',
        time: new Date().toISOString(),
      });
    }
    if (cancelled && !hasCancelled) {
      list.push({
        kind: 'stage',
        message: 'Cancelled',
        time: job?.finished_at ?? new Date().toISOString(),
      });
    }
    return list;
  })();

  if (variant === 'rail') {
    return (
      <div className={cn('flex min-h-0 flex-col', className)}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="inline-flex items-center gap-2 font-label-caps text-muted-foreground">
            <span
              className={cn(
                'size-1.5',
                isLive ? 'animate-pulse bg-primary' : 'bg-muted-foreground/45',
              )}
            />
            {t('pipeline.eyebrow')}
          </p>
          <Badge variant={jobStatusVariant(displayStatus)} className="font-mono">
            {jobStatus}
          </Badge>
        </div>

        {job ? (
          <div className="space-y-3 px-4 py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-normal tracking-tight">
                  {displayName}
                </p>
                {showTickerUnderName ? (
                  <p className="mt-0.5 truncate font-mono text-xs tracking-wide text-muted-foreground">
                    {job.ticker}
                  </p>
                ) : null}
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {displayStage(activeStage ?? job.current_step)}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums text-primary">
                {job.progress_percent ?? 0}%
              </span>
            </div>
            <Progress
              value={job.progress_percent ?? 0}
              className={cn('h-1', isLive && 'bg-primary/15')}
            />
            {loading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ) : events?.length ? (
              <ol className="flex max-h-48 flex-col gap-2 overflow-y-auto border-l border-border pl-3">
                {[...events].slice(-6).reverse().map((event, index) => (
                  <li
                    key={`${event.time ?? 'event'}-${index}`}
                    className="relative text-sm leading-5 text-muted-foreground"
                  >
                    <span
                      className={cn(
                        'absolute top-1.5 -left-[13px] size-1.5',
                        index === 0 ? 'bg-primary' : 'bg-muted-foreground/45',
                      )}
                    />
                    <div className="flex items-baseline gap-2">
                      {event.time ? (
                        <time
                          dateTime={event.time}
                          className="shrink-0 font-mono text-[11px] tabular-nums"
                        >
                          {formatLocaleTime(event.time)}
                        </time>
                      ) : null}
                      <span
                        className={cn(
                          'min-w-0 break-words',
                          index === 0 && 'text-foreground',
                        )}
                      >
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
          <div className="px-4 py-7 text-sm text-muted-foreground">
            <p className="font-medium text-foreground/80">
              {t('pipeline.idleTitle')}
            </p>
            <p className="mt-1 leading-relaxed">{t('pipeline.noEventsBody')}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3', className)}>
      <section
        aria-labelledby="pipeline-title"
        className="@container/card flex min-h-0 flex-1 flex-col border border-border bg-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {job?.ticker ? (
              <InstrumentLogo
                symbol={job.ticker}
                logoUrl={logoUrl}
                alt={displayName ?? job.ticker}
                size="xl"
                tone="accent"
              />
            ) : null}
            <div className="min-w-0">
              <h2
                id="pipeline-title"
                className="truncate text-lg font-semibold tracking-tight"
              >
                {displayName ?? t('pipeline.title')}
              </h2>
              {showTickerUnderName ? (
                <p className="mt-0.5 truncate font-mono text-xs tracking-wide text-muted-foreground">
                  {job?.ticker}
                </p>
              ) : null}
            </div>
          </div>
          <Badge
            variant={jobStatusVariant(displayStatus)}
            className="shrink-0 font-mono"
          >
            {jobStatus}
          </Badge>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-5">
          <div className="@container/stages flex min-h-0 flex-col gap-5">
            <div className="flex items-end justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span
                  className={cn(
                    'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-none',
                    isLive
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-primary/10 text-primary',
                  )}
                >
                  <CurrentStageIcon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t('pipeline.currentStage')}
                  </p>
                  <p className="mt-1 truncate text-base font-medium">
                    {displayStage(
                      stopping && !cancelled
                        ? (job?.current_step === 'Stopping' ||
                          job?.current_step === 'Stop requested'
                            ? job.current_step
                            : 'Stopping')
                        : (activeStage ?? job?.current_step),
                    )}
                  </p>
                </div>
              </div>
              <span className="shrink-0 font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                {job?.progress_percent ?? 0}%
              </span>
            </div>
            <Progress
              value={job?.progress_percent ?? 0}
              className={cn('h-1.5', isLive && 'bg-primary/15')}
            />

            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {stages.map((stage, index) => {
                const current =
                  index === activeIndex &&
                  (job?.status === 'running' || job?.status === 'queued');
                const complete =
                  activeIndex > index || job?.status === 'succeeded';
                const label = statusLabel(complete, current);
                const stageName = displayStage(stage);
                const description = stageDescription(stage);
                const StageIcon = getStageIcon(stage);
                return (
                  <li
                    key={stage}
                    aria-label={t('pipeline.stageStatus', {
                      stage: stageName,
                      status: label,
                    })}
                    data-stage-status={label}
                    title={description ? `${stageName} — ${description}` : stageName}
                    className={cn(
                      'relative flex min-w-0 items-center gap-2 rounded-none border px-2.5 py-2.5 transition-colors',
                      complete && 'border-primary/30 bg-primary/5',
                      current &&
                        'border-primary bg-primary/10 shadow-[0_0_0_1px] shadow-primary/20',
                      !complete && !current && 'bg-muted/20',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-none',
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
                      {description ? (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                          {description}
                        </p>
                      ) : (
                        <p className="mt-0.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                          {String(index + 1).padStart(2, '0')}
                        </p>
                      )}
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

          <div className="mt-auto flex shrink-0 flex-col rounded-none border bg-muted/25">
            <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
              <p className="inline-flex items-center gap-1.5 text-sm font-medium">
                <ScrollText className="size-3.5 text-muted-foreground" />
                {t('pipeline.eventLog')}
              </p>
              <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                {t('pipeline.latest')}
              </span>
            </div>
            {loading ? (
              <div className="flex flex-col gap-2 px-3 py-2.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ) : timelineEvents.length ? (
              <ScrollArea className="h-[11rem]">
                <ol className="flex flex-col gap-2 px-3 py-2.5">
                  {[...timelineEvents].reverse().map((event, index) => (
                    <li
                      key={`${event.time ?? 'event'}-${index}`}
                      className="flex items-baseline gap-2.5 text-xs leading-5 text-muted-foreground"
                    >
                      {event.time ? (
                        <time
                          dateTime={event.time}
                          className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80"
                        >
                          {formatLocaleTime(event.time)}
                        </time>
                      ) : null}
                      <span
                        className={cn(
                          'min-w-0 break-words',
                          index === 0 && 'text-foreground',
                        )}
                      >
                        {localizeProgressMessage(event.message, t)}
                      </span>
                    </li>
                  ))}
                </ol>
              </ScrollArea>
            ) : (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                {t('pipeline.noEventsBody')}
              </p>
            )}
          </div>
        </div>
      </section>

      {canStop ? (
        <>
          <div className="flex shrink-0 justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-w-[10rem] gap-2 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={stopping}
              onClick={() => setConfirmStopOpen(true)}
            >
              {stopping ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Square
                  className="fill-current"
                  data-icon="inline-start"
                  aria-hidden
                />
              )}
              {stopping ? t('pipeline.stopping') : t('pipeline.stop')}
            </Button>
          </div>
          <Dialog open={confirmStopOpen} onOpenChange={setConfirmStopOpen}>
            <DialogContent showCloseButton={false} className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t('pipeline.stopConfirmTitle')}</DialogTitle>
                <DialogDescription>
                  {t('pipeline.stopConfirmBody')}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmStopOpen(false)}
                >
                  {t('pipeline.stopConfirmCancel')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  disabled={stopping}
                  onClick={() => {
                    setConfirmStopOpen(false);
                    onStop?.();
                  }}
                >
                  {stopping ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Square
                      className="fill-current"
                      data-icon="inline-start"
                      aria-hidden
                    />
                  )}
                  {t('pipeline.stopConfirmAction')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}

      {showResultActions ? (
        <div className="flex shrink-0 flex-col gap-3 border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">
              {job?.status === 'succeeded'
                ? t('pipeline.resultSucceededTitle')
                : cancelled
                  ? t('pipeline.resultCancelledTitle')
                  : t('pipeline.resultFailedTitle')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {job?.status === 'succeeded'
                ? t('pipeline.resultSucceededBody')
                : cancelled
                  ? t('pipeline.resultCancelledBody')
                  : t('pipeline.resultFailedBody')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onAnalyzeAgain}
            >
              <RotateCcw data-icon="inline-start" aria-hidden />
              {t('pipeline.analyzeAgain')}
            </Button>
            {job?.status === 'succeeded' && onViewReport ? (
              <Button type="button" size="lg" onClick={onViewReport}>
                <FileText data-icon="inline-start" aria-hidden />
                {t('pipeline.viewReport')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
