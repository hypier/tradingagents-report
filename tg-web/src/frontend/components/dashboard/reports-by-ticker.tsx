import { ChevronRight, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { InstrumentIdentity } from '../instrument-identity';
import { InstrumentLogo } from '../instrument-logo';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import {
  decisionBadgeVariant,
  formatDecisionLabel,
} from '@/frontend/lib/format-decision';
import {
  formatLocaleCalendarDate,
  formatLocaleDateTime,
  parseSortableDateInput,
} from '@/frontend/lib/format-locale';
import { formatOutputLanguage } from '@/frontend/lib/format-output-language';
import { formatDisplayTicker } from '@/shared/listing';
import type { AnalysisJob, AssetIdentity } from '../../lib/research';

export type TickerReportGroup = {
  ticker: string;
  jobs: AnalysisJob[];
};

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

function jobSortTime(job: AnalysisJob) {
  return parseSortableDateInput(
    job.trade_date ?? job.updated_at ?? job.created_at ?? 0,
  );
}

/** Group jobs by ticker; newest trade date first within and across groups. */
export function groupJobsByTicker(jobs: AnalysisJob[]): TickerReportGroup[] {
  const byTicker = new Map<string, AnalysisJob[]>();
  for (const job of jobs) {
    const key = job.ticker.trim().toUpperCase() || job.ticker;
    const list = byTicker.get(key);
    if (list) list.push(job);
    else byTicker.set(key, [job]);
  }

  return [...byTicker.entries()]
    .map(([ticker, groupJobs]) => ({
      ticker,
      jobs: [...groupJobs].sort((a, b) => jobSortTime(b) - jobSortTime(a)),
    }))
    .sort((a, b) => jobSortTime(b.jobs[0]!) - jobSortTime(a.jobs[0]!));
}

export function ReportsByTicker({
  jobs,
  loading,
  error,
  identities = {},
  onOpenReport,
}: {
  jobs: AnalysisJob[];
  loading: boolean;
  error: boolean;
  identities?: Record<string, AssetIdentity>;
  onOpenReport: (id: string) => void;
}) {
  const { t } = useTranslation(['reports', 'common']);
  const groups = groupJobsByTicker(jobs);

  function formatAnalystTeam(analysts?: string[] | null) {
    if (!analysts?.length) return t('table.configuredTeam');
    return analysts
      .map((analyst) =>
        t(`common:analysts.${analyst}`, { defaultValue: analyst }),
      )
      .join(', ');
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3 px-5 py-4 lg:px-6">
        <Skeleton className="h-24 w-full rounded-none" />
        <Skeleton className="h-24 w-full rounded-none" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted-foreground lg:px-6">
        {t('table.unavailable')}
      </p>
    );
  }

  if (!groups.length) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted-foreground lg:px-6">
        {t('table.empty')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-5 py-4 lg:px-6">
      {groups.map((group) => {
        const head = group.jobs[0]!;
        const name = instrumentName(head, identities);
        const ticker = instrumentTicker(head, identities);
        const logoUrl = instrumentLogo(head, identities);
        return (
          <section
            key={group.ticker}
            className="min-w-0 overflow-hidden border border-border bg-card"
          >
            <header className="flex items-center gap-2.5 bg-muted/45 px-3 py-2.5">
              <InstrumentLogo
                symbol={ticker}
                logoUrl={logoUrl}
                alt={t('table.logoAlt', { ticker: head.ticker })}
                size="sm"
              />
              <InstrumentIdentity
                className="min-w-0 flex-1"
                density="compact"
                name={name}
                ticker={ticker}
              />
              <Badge
                variant="secondary"
                className="shrink-0 font-mono text-[11px] tabular-nums"
              >
                {t('byTicker.reportCount', { count: group.jobs.length })}
              </Badge>
            </header>

            <ul className="border-t border-border bg-background">
              {group.jobs.map((job, index) => {
                const label = formatDecisionLabel(
                  job.decision,
                  (key, options) => t(`common:${key}`, options),
                );
                return (
                  <li
                    key={job.id}
                    className={
                      index > 0 ? 'border-t border-border/70' : undefined
                    }
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex cursor-pointer items-center gap-3 py-2.5 pr-3 pl-12 text-left transition-colors hover:bg-muted/30"
                      aria-label={t('table.viewReportFor', {
                        ticker: job.ticker,
                      })}
                      onClick={() => onOpenReport(job.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onOpenReport(job.id);
                        }
                      }}
                    >
                      <span className="inline-flex w-[6.75rem] shrink-0 items-center gap-1.5 font-mono text-sm tabular-nums text-foreground/90">
                        <FileText
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        {formatLocaleCalendarDate(
                          job.trade_date,
                          t('table.notAvailable'),
                        )}
                      </span>
                      <span className="w-[5.75rem] shrink-0">
                        {label ? (
                          <Badge
                            variant={decisionBadgeVariant(job.decision)}
                            className="h-5 px-1.5 text-[11px]"
                          >
                            {label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t('table.noConclusion')}
                          </span>
                        )}
                      </span>
                      <span className="hidden w-[7rem] shrink-0 sm:block">
                        {job.output_language?.trim() ? (
                          <Badge
                            variant="outline"
                            className="h-5 max-w-full truncate px-1.5 text-[11px]"
                          >
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
                      </span>
                      <span
                        className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground md:block"
                        title={formatAnalystTeam(job.analysts)}
                      >
                        {formatAnalystTeam(job.analysts)}
                      </span>
                      <span className="hidden shrink-0 font-mono text-xs tabular-nums text-muted-foreground lg:inline">
                        {formatLocaleDateTime(
                          job.updated_at ?? job.created_at,
                          t('table.notAvailable'),
                        )}
                      </span>
                      <ChevronRight
                        className="size-3.5 shrink-0 text-muted-foreground/70"
                        aria-hidden
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
