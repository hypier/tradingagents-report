import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { AdminGate } from '@/frontend/components/admin-gate';
import { PageFrame, SectionPanel } from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
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
import {
  adjustUserCredits,
  getManagedUserDetail,
  updateManagedUserBan,
} from '@/frontend/lib/auth';

export function AdminUserDetailPage() {
  const { t } = useTranslation('admin');
  const { userId = '' } = useParams();
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const [delta, setDelta] = useState('1');
  const [reason, setReason] = useState('');
  const detail = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => getManagedUserDetail(userId),
    enabled: Boolean(userId) && session.data?.data.user.role === 'admin',
  });
  const ban = useMutation({
    mutationFn: (banned: boolean) => updateManagedUserBan(userId, banned),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-user', userId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(t('userDetail.banUpdated'));
    },
    onError: () => toast.error(t('userDetail.banError')),
  });
  const adjust = useMutation({
    mutationFn: () =>
      adjustUserCredits({
        clerkUserId: userId,
        delta: Number.parseInt(delta, 10),
        reason,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin-user', userId] });
      toast.success(t('userDetail.creditAdjusted'));
    },
    onError: () => toast.error(t('userDetail.creditError')),
  });

  const payload = detail.data?.data;
  const user = payload?.user;
  const usage = payload?.usage;
  const recentJobs = payload?.recentJobs;
  const loadError = detail.isError || !payload || !user || !usage || !recentJobs;
  const isSelf = Boolean(user) && session.data?.data.user.id === user?.id;

  return (
    <AdminGate
      accessTitle={t('userDetail.accessRequired.title')}
      accessBody={t('userDetail.accessRequired.body')}
      loading={detail.isLoading}
    >
      <PageFrame
        title={user?.displayName ?? t('userDetail.loadError.title')}
        description={
          user ? (
            <div className="space-y-2">
              <Button asChild variant="ghost" size="sm" className="h-auto px-0 py-0">
                <Link to="/admin/users">{t('userDetail.back')}</Link>
              </Button>
              <p className="font-mono">{user.id}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{user.role}</Badge>
                {user.banned ? (
                  <Badge variant="destructive">{t('userDetail.banned')}</Badge>
                ) : (
                  <Badge variant="secondary">{t('userDetail.active')}</Badge>
                )}
              </div>
            </div>
          ) : undefined
        }
        actions={
          user ? (
            <Button
              variant={user.banned ? 'outline' : 'destructive'}
              disabled={isSelf || ban.isPending}
              onClick={() => ban.mutate(!user.banned)}
            >
              {ban.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Ban data-icon="inline-start" />
              )}
              {user.banned ? t('userDetail.unban') : t('userDetail.ban')}
            </Button>
          ) : undefined
        }
      >
        {loadError ? (
          <Alert variant="destructive">
            <AlertTitle>{t('userDetail.loadError.title')}</AlertTitle>
            <AlertDescription>{t('userDetail.loadError.body')}</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionPanel
                title={t('userDetail.credits.title')}
                description={t('userDetail.credits.description')}
              >
                <div className="space-y-3 text-sm">
                  <p>
                    {t('userDetail.credits.available')}:{' '}
                    <span className="font-mono tabular-nums">
                      {usage.availableCredits}
                    </span>
                  </p>
                  <p>
                    {t('userDetail.credits.reserved')}:{' '}
                    <span className="font-mono tabular-nums">
                      {usage.reservedCredits}
                    </span>
                  </p>
                  <p>
                    {t('userDetail.credits.spent')}:{' '}
                    <span className="font-mono tabular-nums">
                      {usage.spentCredits}
                    </span>
                  </p>
                  <p>
                    {t('userDetail.credits.subscription')}:{' '}
                    {usage.subscription?.status ?? '—'}
                  </p>
                  <div className="grid gap-2 border-t border-border pt-3">
                    <Input
                      type="number"
                      value={delta}
                      onChange={(event) => setDelta(event.target.value)}
                      placeholder={t('userDetail.credits.delta')}
                    />
                    <Input
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={t('userDetail.credits.reason')}
                    />
                    <Button
                      disabled={
                        !reason.trim() ||
                        !Number.isInteger(Number(delta)) ||
                        Number(delta) === 0 ||
                        adjust.isPending
                      }
                      onClick={() => adjust.mutate()}
                    >
                      {adjust.isPending ? (
                        <Spinner data-icon="inline-start" />
                      ) : null}
                      {t('userDetail.credits.adjust')}
                    </Button>
                  </div>
                </div>
              </SectionPanel>

              <SectionPanel title={t('userDetail.ledger.title')}>
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('userDetail.ledger.type')}</TableHead>
                        <TableHead>{t('userDetail.ledger.delta')}</TableHead>
                        <TableHead>{t('userDetail.ledger.when')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usage.ledger.map((entry) => (
                        <TableRow key={entry.id} className="h-11">
                          <TableCell>{entry.entryType}</TableCell>
                          <TableCell className="font-mono tabular-nums">
                            {entry.availableDelta}
                          </TableCell>
                          <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                            {formatLocaleDateTimeValue(String(entry.createdAt))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </SectionPanel>
            </div>

            <SectionPanel title={t('userDetail.jobs.title')}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('userDetail.jobs.ticker')}</TableHead>
                    <TableHead>{t('userDetail.jobs.status')}</TableHead>
                    <TableHead>{t('userDetail.jobs.created')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentJobs.map((job) => {
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
                    <TableRow key={String(job.id)} className="h-11">
                      <TableCell>
                        <Link
                          className="block min-w-0 underline-offset-2 hover:underline"
                          to={`/reports/${String(job.id)}`}
                        >
                          <span className="block truncate text-sm font-medium tracking-tight">
                            {displayName || ticker}
                          </span>
                          {displayName ? (
                            <span className="mt-0.5 block font-mono text-xs tracking-wide text-muted-foreground">
                              {ticker}
                            </span>
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {String(job.status ?? '')}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                        {job.created_at
                          ? formatLocaleDateTimeValue(String(job.created_at))
                          : '—'}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </SectionPanel>
          </>
        )}
      </PageFrame>
    </AdminGate>
  );
}
