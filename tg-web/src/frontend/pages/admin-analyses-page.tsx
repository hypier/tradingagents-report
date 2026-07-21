import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { AdminGate } from '@/frontend/components/admin-gate';
import {
  PageFrame,
  PageToolbar,
} from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import { Spinner } from '@/frontend/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { formatLocaleDateTimeValue } from '@/frontend/lib/format-locale';
import { listAdminAnalyses, retryAdminAnalysis } from '@/frontend/lib/auth';

type AdminJob = {
  id: string;
  ticker?: string;
  status?: string;
  clerk_user_id?: string;
  error?: string | null;
  progress_percent?: number | null;
  cost_usd?: string | number | null;
  created_at?: string | null;
  display?: { display_name?: string | null } | null;
};

export function AdminAnalysesPage() {
  const { t } = useTranslation(['admin', 'common']);
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>('all');
  const [ticker, setTicker] = useState('');
  const [userId, setUserId] = useState('');
  const analyses = useQuery({
    queryKey: ['admin-analyses', status, ticker, userId],
    queryFn: () =>
      listAdminAnalyses({
        status: status === 'all' ? undefined : status,
        ticker: ticker.trim() || undefined,
        clerkUserId: userId.trim() || undefined,
      }),
    enabled: session.data?.data.user.role === 'admin',
  });
  const retry = useMutation({
    mutationFn: (jobId: string) => retryAdminAnalysis(jobId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-analyses'] });
      toast.success(t('admin:analyses.retrySuccess'));
    },
    onError: () => toast.error(t('admin:analyses.retryError')),
  });

  const jobs = (analyses.data?.data ?? []) as AdminJob[];

  return (
    <AdminGate
      accessTitle={t('admin:analyses.accessRequired.title')}
      accessBody={t('admin:analyses.accessRequired.body')}
    >
      <PageFrame
        title={t('admin:analyses.heading')}
        description={t('admin:analyses.subtitle')}
        toolbar={
          <PageToolbar className="grid gap-3 md:grid-cols-3">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['all', 'queued', 'running', 'succeeded', 'failed'].map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {value === 'all'
                        ? t('common:status.all')
                        : t(`common:status.${value}`)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <Input
              value={ticker}
              onChange={(event) => setTicker(event.target.value)}
              placeholder={t('admin:analyses.tickerPlaceholder')}
              className="font-mono"
            />
            <Input
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder={t('admin:analyses.userPlaceholder')}
              className="font-mono"
            />
          </PageToolbar>
        }
      >
        {analyses.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : analyses.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t('admin:analyses.loadError.title')}</AlertTitle>
            <AlertDescription>
              {t('admin:analyses.loadError.body')}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="overflow-hidden border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin:analyses.columns.ticker')}</TableHead>
                  <TableHead>{t('admin:analyses.columns.user')}</TableHead>
                  <TableHead>{t('admin:analyses.columns.status')}</TableHead>
                  <TableHead>{t('admin:analyses.columns.created')}</TableHead>
                  <TableHead>{t('admin:analyses.columns.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const display =
                    typeof job.display === 'object' && job.display !== null
                      ? (job.display as { display_name?: unknown })
                      : null;
                  const displayName =
                    typeof display?.display_name === 'string'
                      ? display.display_name.trim()
                      : '';
                  const ticker = String(job.ticker ?? '');
                  return (
                  <TableRow key={String(job.id)}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium tracking-tight">
                          {displayName || ticker}
                        </p>
                        {displayName ? (
                          <p className="mt-0.5 font-mono text-xs tracking-wide text-muted-foreground">
                            {ticker}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {job.clerk_user_id ? (
                        <Link
                          className="font-mono text-xs underline"
                          to={`/admin/users/${encodeURIComponent(job.clerk_user_id)}`}
                        >
                          {job.clerk_user_id}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{job.status}</Badge>
                      {job.error ? (
                        <p className="mt-1 max-w-xs truncate text-xs text-destructive">
                          {job.error}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.created_at
                        ? formatLocaleDateTimeValue(job.created_at)
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/reports/${job.id}`}>
                            {t('admin:analyses.open')}
                          </Link>
                        </Button>
                        {job.status === 'failed' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={retry.isPending}
                            onClick={() => retry.mutate(job.id)}
                          >
                            {retry.isPending && retry.variables === job.id ? (
                              <Spinner data-icon="inline-start" />
                            ) : (
                              <RotateCcw data-icon="inline-start" />
                            )}
                            {t('admin:analyses.retry')}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </PageFrame>
    </AdminGate>
  );
}
