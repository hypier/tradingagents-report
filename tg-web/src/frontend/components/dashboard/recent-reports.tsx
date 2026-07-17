import { ClipboardList, FileText } from 'lucide-react';

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
import { formatDisplayTicker } from '@/shared/display-ticker';
import type { AnalysisJob, AssetIdentity } from '../../lib/research';

function instrumentTicker(
  job: AnalysisJob,
  identities: Record<string, AssetIdentity>,
) {
  return (
    identities[job.ticker]?.display_ticker ?? formatDisplayTicker(job.ticker)
  );
}

function formatDate(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Not available';
}

function statusVariant(status: AnalysisJob['status']) {
  if (status === 'failed') return 'destructive';
  if (status === 'running' || status === 'queued') return 'info';
  if (status === 'succeeded') return 'default';
  return 'secondary';
}

export function RecentReports({
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
  return (
    <Card aria-labelledby="reports-title">
      <CardHeader className="border-b">
        <CardTitle className="inline-flex items-center gap-2">
          <ClipboardList className="size-4 text-primary" />
          <h2 id="reports-title">Recent reports</h2>
        </CardTitle>
        <CardDescription>
          Completed and in-progress research runs.
        </CardDescription>
        <CardAction>
          <Badge variant="outline" className="font-mono tabular-nums">
            {jobs.length} runs
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-6">Instrument</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="pr-6 text-right">Report</TableHead>
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
                  Research history is temporarily unavailable.
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
                        data-logo-url={identities[job.ticker]?.logo_url}
                      >
                        <AvatarImage
                          src={identities[job.ticker]?.logo_url}
                          alt={`${job.ticker} logo`}
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
                          {job.decision ?? 'No conclusion yet'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-xs text-muted-foreground capitalize">
                    {job.analysts?.join(', ') || 'Configured team'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={statusVariant(job.status)}
                      className="capitalize"
                    >
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatDate(job.updated_at ?? job.created_at)}
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`View report for ${job.ticker}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenReport(job.id);
                          }}
                        >
                          <FileText />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={6}>
                        View report
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
                  Start a research run to build your report library.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
