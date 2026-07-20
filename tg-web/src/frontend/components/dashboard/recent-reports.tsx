import { ClipboardList, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Button } from '../ui/button';
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
import { formatLocaleDateTime } from '@/frontend/lib/format-locale';
import { formatOutputLanguage } from '@/frontend/lib/format-output-language';
import { formatDisplayTicker } from '@/shared/listing';
import type { AnalysisJob, AssetIdentity } from '../../lib/research';

function instrumentTicker(
  job: AnalysisJob,
  identities: Record<string, AssetIdentity>,
) {
  return (
    identities[job.ticker]?.display_ticker ?? formatDisplayTicker(job.ticker)
  );
}

function instrumentName(
  job: AnalysisJob,
  identities: Record<string, AssetIdentity>,
) {
  return job.display?.display_name ?? identities[job.ticker]?.display_name;
}

function instrumentLogo(
  job: AnalysisJob,
  identities: Record<string, AssetIdentity>,
) {
  return job.display?.logo_url ?? identities[job.ticker]?.logo_url;
}

function statusVariant(status: AnalysisJob['status']) {
  if (status === 'failed') return 'destructive';
  if (status === 'running' || status === 'queued') return 'running';
  if (status === 'succeeded') return 'up';
  return 'secondary';
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
}: ReportsTableProps) {
  const { t } = useTranslation(['reports', 'common']);
  const isRail = density === 'rail';

  function formatAnalystTeam(analysts?: string[] | null) {
    if (!analysts?.length) return t('table.configuredTeam');
    return analysts
      .map((analyst) =>
        t(`common:analysts.${analyst}`, { defaultValue: analyst }),
      )
      .join(', ');
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
                      <Avatar
                        className="size-8! shrink-0 !rounded-none after:!rounded-none"
                        data-logo-url={logoUrl}
                      >
                        <AvatarImage
                          src={logoUrl}
                          alt={t('table.logoAlt', { ticker: job.ticker })}
                          className="!rounded-none"
                        />
                        <AvatarFallback className="!rounded-none text-xs font-semibold">
                          {ticker.slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-sm font-medium tracking-wide">
                          {ticker}
                        </span>
                        {name ? (
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {name}
                          </span>
                        ) : null}
                      </span>
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
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-5 py-3.5 lg:px-6">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="inline-flex items-center gap-2 text-base font-semibold tracking-tight"
          >
            <ClipboardList className="size-4 text-primary" />
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="outline" className="font-mono tabular-nums">
          {t('table.runs', { count: jobs.length })}
        </Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5 lg:pl-6">{t('table.instrument')}</TableHead>
            <TableHead>{t('table.team')}</TableHead>
            <TableHead>{t('table.status')}</TableHead>
            <TableHead>{t('table.language')}</TableHead>
            <TableHead>{t('table.updated')}</TableHead>
            <TableHead className="pr-5 text-right lg:pr-6">
              {t('table.report')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell colSpan={6} className="px-5 lg:px-6">
                  <Skeleton className="h-6 w-full rounded-none" />
                </TableCell>
              </TableRow>
            ))
          ) : error ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="h-24 text-center text-muted-foreground"
              >
                {t('table.unavailable')}
              </TableCell>
            </TableRow>
          ) : jobs.length ? (
            jobs.map((job) => (
              <TableRow
                key={job.id}
                className="h-12 cursor-pointer"
                onClick={() => onOpenReport(job.id)}
              >
                <TableCell className="pl-5 lg:pl-6">
                  <div className="flex items-center gap-2.5">
                    <Avatar
                      size="sm"
                      className="!rounded-none after:!rounded-none"
                      data-logo-url={instrumentLogo(job, identities)}
                    >
                      <AvatarImage
                        src={instrumentLogo(job, identities)}
                        alt={t('table.logoAlt', { ticker: job.ticker })}
                        className="!rounded-none"
                      />
                      <AvatarFallback className="!rounded-none">
                        {job.ticker.slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-mono text-sm font-medium tracking-wide">
                        {instrumentTicker(job, identities)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {instrumentName(job, identities) ??
                          job.decision ??
                          t('table.noConclusion')}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                  {formatAnalystTeam(job.analysts)}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(job.status)}>
                    {t(`common:status.${job.status}`, {
                      defaultValue: job.status,
                    })}
                  </Badge>
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
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={6}
                className="h-28 text-center text-muted-foreground"
              >
                {t('table.empty')}
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
