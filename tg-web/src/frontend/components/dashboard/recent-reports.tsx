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
  if (status === 'running' || status === 'queued') return 'info';
  if (status === 'succeeded') return 'default';
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
}: ReportsTableProps) {
  const { t } = useTranslation(['reports', 'common']);

  function formatAnalystTeam(analysts?: string[] | null) {
    if (!analysts?.length) return t('table.configuredTeam');
    return analysts
      .map((analyst) =>
        t(`common:analysts.${analyst}`, { defaultValue: analyst }),
      )
      .join(', ');
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
                  <TableCell colSpan={5} className="px-6">
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={5}
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
                  colSpan={5}
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
