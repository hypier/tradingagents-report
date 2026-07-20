import { ClipboardList, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Button } from '../ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
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
          <h2
            id={titleId}
            className="font-label-caps text-muted-foreground"
          >
            {title}
          </h2>
          <Badge variant="outline" className="font-mono text-xs tabular-nums">
            {t('table.runs', { count: jobs.length })}
          </Badge>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-2.5 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
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
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                      onClick={() => onOpenReport(job.id)}
                    >
                      <Avatar
                        className="size-10! shrink-0"
                        data-logo-url={logoUrl}
                      >
                        <AvatarImage
                          src={logoUrl}
                          alt={t('table.logoAlt', { ticker: job.ticker })}
                        />
                        <AvatarFallback className="text-sm font-semibold">
                          {ticker.slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium tracking-tight">
                          {name ?? ticker}
                        </span>
                        {name ? (
                          <span className="mt-0.5 block truncate font-mono text-xs tracking-wide text-muted-foreground">
                            {ticker}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant={statusVariant(job.status)}>
                          {t(`common:status.${job.status}`, {
                            defaultValue: job.status,
                          })}
                        </Badge>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
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
            <p className="p-5 text-center text-sm text-muted-foreground">
              {t('table.empty')}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card aria-labelledby={titleId}>
      <CardHeader className="border-b">
        <CardTitle className="inline-flex items-center gap-2">
          <ClipboardList className="size-4 text-primary" />
          <h2 id={titleId}>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Badge variant="outline" className="font-mono tabular-nums">
            {t('table.runs', { count: jobs.length })}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6">{t('table.instrument')}</TableHead>
              <TableHead>{t('table.team')}</TableHead>
              <TableHead>{t('table.status')}</TableHead>
              <TableHead>{t('table.language')}</TableHead>
              <TableHead>{t('table.updated')}</TableHead>
              <TableHead className="pr-6 text-right">
                {t('table.report')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={6} className="px-6">
                    <Skeleton className="h-6 w-full" />
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
                  className="cursor-pointer"
                  onClick={() => onOpenReport(job.id)}
                >
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        size="sm"
                        data-logo-url={instrumentLogo(job, identities)}
                      >
                        <AvatarImage
                          src={instrumentLogo(job, identities)}
                          alt={t('table.logoAlt', { ticker: job.ticker })}
                        />
                        <AvatarFallback>
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
                  <TableCell className="pr-6 text-right">
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
      </CardContent>
    </Card>
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
