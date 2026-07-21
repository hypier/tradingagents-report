import {
  AlertCircle,
  ClipboardList,
  FileText,
  ListTodo,
  Star,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { InstrumentIdentity } from '../instrument-identity';
import { InstrumentLogo } from '../instrument-logo';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Skeleton } from '../ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import {
  formatLocaleCalendarDate,
  formatLocaleDateTime,
  formatLocaleTime,
  parseLocaleDateInput,
} from '@/frontend/lib/format-locale';
import {
  decisionBadgeVariant,
  formatDecisionLabel,
} from '@/frontend/lib/format-decision';
import { formatOutputLanguage } from '@/frontend/lib/format-output-language';
import { localizeProgressMessage } from '@/frontend/lib/localize-progress-message';
import { formatDisplayTicker } from '@/shared/listing';
import type { AnalysisJob, AssetIdentity } from '../../lib/research';

function instrumentTicker(
  job: AnalysisJob,
  identities: Record<string, AssetIdentity>,
) {
  const key = job.ticker.trim().toUpperCase();
  return (
    identities[key]?.display_ticker ?? formatDisplayTicker(job.ticker)
  );
}

function instrumentName(
  job: AnalysisJob,
  identities: Record<string, AssetIdentity>,
) {
  const key = job.ticker.trim().toUpperCase();
  return job.display?.display_name ?? identities[key]?.display_name;
}

function instrumentLogo(
  job: AnalysisJob,
  identities: Record<string, AssetIdentity>,
) {
  const key = job.ticker.trim().toUpperCase();
  return job.display?.logo_url ?? identities[key]?.logo_url;
}

function statusVariant(status: AnalysisJob['status']) {
  if (status === 'failed') return 'destructive';
  if (status === 'running' || status === 'queued') return 'running';
  if (status === 'succeeded') return 'up';
  return 'secondary';
}

/** Stopwatch-style duration for job ledgers (e.g. 3:12, 1:05:00). */
export function formatJobDuration(
  start?: string | null,
  end?: string | null,
  now = Date.now(),
): string | null {
  if (!start) return null;
  const startMs = new Date(start).getTime();
  if (Number.isNaN(startMs)) return null;
  const endMs = end ? new Date(end).getTime() : now;
  if (Number.isNaN(endMs) || endMs < startMs) return null;
  const totalSeconds = Math.floor((endMs - startMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${minutes}:${ss}`;
}

/** Today → HH:mm; otherwise short localized datetime (year omitted when current). */
function formatCompactSubmitted(value?: string | null, fallback = '—') {
  if (!value) return fallback;
  const date = parseLocaleDateInput(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const now = new Date();
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return formatLocaleTime(value, fallback).slice(0, 5);
  }
  return formatLocaleDateTime(value, fallback);
}

type ReportsTableProps = {
  jobs: AnalysisJob[];
  loading: boolean;
  error: boolean;
  identities?: Record<string, AssetIdentity>;
  onOpenReport: (id: string) => void;
  title: string;
  description: string;
  titleId: string;
  /** full = complete columns; rail = dense ticker/status/date for desk sidebar */
  density?: 'full' | 'rail';
  /** tasks = ops ledger; library = research archive (ignored when density is rail) */
  variant?: 'tasks' | 'library';
  /** Hide the ruled section title block (page already owns the h1). */
  hideSectionHeader?: boolean;
};

export function ReportsTable({
  jobs,
  loading,
  error,
  identities = {},
  onOpenReport,
  title,
  description,
  titleId,
  density = 'full',
  variant = 'library',
  hideSectionHeader = false,
}: ReportsTableProps) {
  const { t } = useTranslation(['reports', 'tasks', 'common', 'home']);
  const isRail = density === 'rail';
  const isTasks = !isRail && variant === 'tasks';
  const columnCount = isTasks ? 6 : 7;

  function taskDurationLabel(job: AnalysisJob) {
    if (job.status === 'queued' || !job.started_at) return '—';
    return (
      formatJobDuration(
        job.started_at,
        job.status === 'running' ? null : (job.finished_at ?? job.updated_at),
      ) ?? '—'
    );
  }

  function formatAnalystTeam(analysts?: string[] | null) {
    if (!analysts?.length) return t('table.configuredTeam');
    return analysts
      .map((analyst) =>
        t(`common:analysts.${analyst}`, { defaultValue: analyst }),
      )
      .join(', ');
  }

  function stepLabel(job: AnalysisJob) {
    if (job.status === 'queued') return t('common:stages.waiting');
    if (job.status === 'succeeded') return t('tasks:table.complete');
    if (job.status === 'failed') return t('tasks:table.stopped');
    if (!job.current_step) return t('common:stages.waiting');
    return localizeProgressMessage(job.current_step, t);
  }

  if (isRail) {
    return (
      <div aria-labelledby={titleId} className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id={titleId} className="font-label-caps text-muted-foreground">
            {title}
          </h2>
          <Badge variant="outline" className="font-mono text-xs tabular-nums">
            {t('table.runs', { count: jobs.length })}
          </Badge>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-0 divide-y divide-border">
              <Skeleton className="h-11 w-full rounded-none" />
              <Skeleton className="h-11 w-full rounded-none" />
              <Skeleton className="h-11 w-full rounded-none" />
            </div>
          ) : error ? (
            <p className="p-4 text-sm text-muted-foreground">
              {t('table.unavailable')}
            </p>
          ) : jobs.length ? (
            <ul className="divide-y divide-border">
              {jobs.slice(0, 12).map((job) => {
                const logoUrl = instrumentLogo(job, identities);
                const name = instrumentName(job, identities);
                const ticker = instrumentTicker(job, identities);
                return (
                  <li key={job.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/35"
                      onClick={() => onOpenReport(job.id)}
                    >
                      <InstrumentLogo
                        symbol={ticker}
                        logoUrl={logoUrl}
                        alt={t('table.logoAlt', { ticker: job.ticker })}
                        size="md"
                      />
                      <InstrumentIdentity
                        className="min-w-0 flex-1"
                        density="compact"
                        name={name}
                        ticker={ticker}
                      />
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <Badge
                          variant={statusVariant(job.status)}
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {t(`common:status.${job.status}`, {
                            defaultValue: job.status,
                          })}
                        </Badge>
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          {formatLocaleDateTime(
                            job.updated_at ?? job.created_at,
                            '—',
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">{t('table.empty')}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div aria-labelledby={titleId} className="flex min-h-0 flex-col">
      {hideSectionHeader ? (
        <div className="flex items-center justify-end border-b border-border px-5 py-2 lg:px-6">
          <Badge variant="outline" className="font-mono tabular-nums">
            {isTasks
              ? t('tasks:table.jobs', { count: jobs.length })
              : t('table.runs', { count: jobs.length })}
          </Badge>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-5 py-3.5 lg:px-6">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="inline-flex items-center gap-2 text-base font-semibold tracking-tight"
            >
              {isTasks ? (
                <ListTodo className="size-4 text-primary" />
              ) : (
                <ClipboardList className="size-4 text-primary" />
              )}
              {title}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          </div>
          <Badge variant="outline" className="font-mono tabular-nums">
            {isTasks
              ? t('tasks:table.jobs', { count: jobs.length })
              : t('table.runs', { count: jobs.length })}
          </Badge>
        </div>
      )}
      {hideSectionHeader ? <span id={titleId} className="sr-only">{title}</span> : null}
      <Table className={isTasks ? 'table-fixed' : undefined}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {isTasks ? (
              <>
                <TableHead className="w-[5.5rem] pl-5 lg:pl-6">
                  {t('tasks:table.status')}
                </TableHead>
                <TableHead className="min-w-0">{t('table.instrument')}</TableHead>
                <TableHead className="w-[7.5rem]">{t('tasks:table.submitted')}</TableHead>
                <TableHead className="w-[5rem]">{t('tasks:table.duration')}</TableHead>
                <TableHead className="w-[7rem]">{t('tasks:table.step')}</TableHead>
                <TableHead className="w-16 pr-5 text-right lg:pr-6">
                  {t('tasks:table.open')}
                </TableHead>
              </>
            ) : (
              <>
                <TableHead className="pl-5 lg:pl-6">{t('table.instrument')}</TableHead>
                <TableHead>{t('table.decision')}</TableHead>
                <TableHead>{t('table.tradeDate')}</TableHead>
                <TableHead>{t('table.team')}</TableHead>
                <TableHead>{t('table.language')}</TableHead>
                <TableHead>{t('table.updated')}</TableHead>
                <TableHead className="pr-5 text-right lg:pr-6">
                  {t('table.report')}
                </TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell colSpan={columnCount} className="px-5 lg:px-6">
                  <Skeleton className="h-6 w-full rounded-none" />
                </TableCell>
              </TableRow>
            ))
          ) : error ? (
            <TableRow>
              <TableCell
                colSpan={columnCount}
                className="h-24 text-center text-muted-foreground"
              >
                {isTasks ? t('tasks:table.unavailable') : t('table.unavailable')}
              </TableCell>
            </TableRow>
          ) : jobs.length ? (
            jobs.map((job) => {
              if (isTasks) {
                const duration = taskDurationLabel(job);
                return (
                  <TableRow
                    key={job.id}
                    className={
                      job.status === 'failed'
                        ? 'h-12'
                        : 'h-12 cursor-pointer'
                    }
                    onClick={
                      job.status === 'failed'
                        ? undefined
                        : () => onOpenReport(job.id)
                    }
                  >
                    <TableCell className="w-[5.5rem] pl-5 lg:pl-6">
                      <Badge
                        variant={statusVariant(job.status)}
                        className="w-fit"
                      >
                        {t(`common:status.${job.status}`, {
                          defaultValue: job.status,
                        })}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <InstrumentLogo
                          symbol={instrumentTicker(job, identities)}
                          logoUrl={instrumentLogo(job, identities)}
                          alt={t('table.logoAlt', { ticker: job.ticker })}
                          size="md"
                        />
                        <InstrumentIdentity
                          className="min-w-0"
                          density="row"
                          name={instrumentName(job, identities)}
                          ticker={instrumentTicker(job, identities)}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="w-[7.5rem] font-mono text-xs tabular-nums text-muted-foreground">
                      {formatCompactSubmitted(
                        job.created_at,
                        t('table.notAvailable'),
                      )}
                    </TableCell>
                    <TableCell className="w-[5rem]">
                      <span
                        className={
                          duration === '—'
                            ? 'font-mono text-sm tabular-nums text-muted-foreground/70'
                            : 'font-mono text-sm tabular-nums tracking-tight text-foreground/85'
                        }
                      >
                        {duration}
                      </span>
                    </TableCell>
                    <TableCell className="w-[7rem]">
                      {job.status === 'running' ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-xs text-muted-foreground">
                              {stepLabel(job)}
                            </span>
                            {job.progress_percent != null ? (
                              <span className="shrink-0 font-mono text-[11px] tabular-nums text-primary">
                                {Math.round(job.progress_percent)}%
                              </span>
                            ) : null}
                          </div>
                          <Progress
                            value={job.progress_percent ?? 0}
                            className="h-1"
                          />
                        </div>
                      ) : (
                        <span className="truncate text-xs text-muted-foreground">
                          {stepLabel(job)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="w-16 pr-5 text-right lg:pr-6">
                      <div className="inline-flex items-center justify-end gap-0.5">
                        {job.status === 'failed' ? (
                          job.error ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex size-8 items-center justify-center text-destructive"
                                  aria-label={t('tasks:table.errorReason')}
                                >
                                  <AlertCircle className="size-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                sideOffset={6}
                                className="max-w-xs text-left"
                              >
                                {job.error}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t('tasks:table.openFor', {
                                  ticker: job.ticker,
                                })}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onOpenReport(job.id);
                                }}
                              >
                                <FileText />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" sideOffset={6}>
                              {t('tasks:table.open')}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }

              return (
                <TableRow
                  key={job.id}
                  className="h-12 cursor-pointer"
                  onClick={() => onOpenReport(job.id)}
                >
                  <TableCell className="pl-5 lg:pl-6">
                    <div className="flex items-center gap-2.5">
                      <InstrumentLogo
                        symbol={instrumentTicker(job, identities)}
                        logoUrl={instrumentLogo(job, identities)}
                        alt={t('table.logoAlt', { ticker: job.ticker })}
                        size="md"
                      />
                      <div className="flex min-w-0 items-start gap-1.5">
                        <InstrumentIdentity
                          density="row"
                          name={instrumentName(job, identities)}
                          ticker={instrumentTicker(job, identities)}
                        />
                        {job.is_favorite ? (
                          <Star
                            className="mt-0.5 size-3.5 shrink-0 fill-primary text-primary"
                            aria-label={t('table.favorite')}
                          />
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const label = formatDecisionLabel(
                        job.decision,
                        (key, options) => t(`common:${key}`, options),
                      );
                      if (!label) {
                        return (
                          <span className="text-xs text-muted-foreground">
                            {t('table.noConclusion')}
                          </span>
                        );
                      }
                      return (
                        <Badge variant={decisionBadgeVariant(job.decision)}>
                          {label}
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatLocaleCalendarDate(
                      job.trade_date,
                      t('table.notAvailable'),
                    )}
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                    {formatAnalystTeam(job.analysts)}
                  </TableCell>
                  <TableCell>
                    {job.output_language?.trim() ? (
                      <Badge variant="outline">
                        {formatOutputLanguage(
                          job.output_language,
                          (key, options) => t(`common:${key}`, options),
                        )}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t('table.notAvailable')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatLocaleDateTime(
                      job.updated_at ?? job.created_at,
                      t('table.notAvailable'),
                    )}
                  </TableCell>
                  <TableCell className="pr-5 text-right lg:pr-6">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('table.viewReportFor', {
                            ticker: job.ticker,
                          })}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenReport(job.id);
                          }}
                        >
                          <FileText />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={6}>
                        {t('table.viewReport')}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={columnCount}
                className="h-28 text-center text-muted-foreground"
              >
                {isTasks ? t('tasks:table.empty') : t('table.empty')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function RecentReports(
  props: Omit<ReportsTableProps, 'title' | 'description' | 'titleId'>,
) {
  const { t } = useTranslation('home');

  return (
    <ReportsTable
      {...props}
      title={t('recent.title')}
      description={t('recent.description')}
      titleId="reports-title"
    />
  );
}
