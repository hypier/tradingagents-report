import { MoreHorizontal } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Skeleton } from '../ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import type { AnalysisJob } from '../../lib/research';

function formatDate(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Not available';
}

export function RecentReports({
  jobs,
  loading,
  error,
  onOpenReport,
}: {
  jobs: AnalysisJob[];
  loading: boolean;
  error: boolean;
  onOpenReport: (id: string) => void;
}) {
  return (
    <Card aria-labelledby="reports-title">
      <CardHeader>
        <CardTitle>
          <h2 id="reports-title">Recent research reports</h2>
        </CardTitle>
        <CardDescription>Completed and active research runs.</CardDescription>
        <CardAction>
          <Badge variant="outline">{jobs.length} runs</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
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
                <TableRow key={job.id}>
                  <TableCell className="pl-6">
                    <div className="font-medium">{job.ticker}</div>
                    <div className="text-xs text-muted-foreground">
                      {job.decision ?? 'No conclusion yet'}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                    {job.analysts?.join(', ') || 'Configured team'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        job.status === 'succeeded' ? 'secondary' : 'outline'
                      }
                      className="capitalize"
                    >
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(job.updated_at ?? job.created_at)}
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${job.ticker}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            onSelect={() => onOpenReport(job.id)}
                          >
                            View report
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
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
