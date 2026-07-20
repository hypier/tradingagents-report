import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { AdminGate } from '@/frontend/components/admin-gate';
import { PageFrame } from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
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
              <Card>
                <CardHeader>
                  <CardTitle>{t('userDetail.credits.title')}</CardTitle>
                  <CardDescription>
                    {t('userDetail.credits.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>
                    {t('userDetail.credits.available')}: {usage.availableCredits}
                  </p>
                  <p>
                    {t('userDetail.credits.reserved')}: {usage.reservedCredits}
                  </p>
                  <p>
                    {t('userDetail.credits.spent')}: {usage.spentCredits}
                  </p>
                  <p>
                    {t('userDetail.credits.subscription')}:{' '}
                    {usage.subscription?.status ?? '—'}
                  </p>
                  <div className="grid gap-2 border-t pt-3">
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('userDetail.ledger.title')}</CardTitle>
                </CardHeader>
                <CardContent className="max-h-80 overflow-auto">
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
                        <TableRow key={entry.id}>
                          <TableCell>{entry.entryType}</TableCell>
                          <TableCell className="tabular-nums">
                            {entry.availableDelta}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatLocaleDateTimeValue(String(entry.createdAt))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t('userDetail.jobs.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('userDetail.jobs.ticker')}</TableHead>
                      <TableHead>{t('userDetail.jobs.status')}</TableHead>
                      <TableHead>{t('userDetail.jobs.created')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentJobs.map((job) => (
                      <TableRow key={String(job.id)}>
                        <TableCell>
                          <Link
                            className="font-mono underline"
                            to={`/reports/${String(job.id)}`}
                          >
                            {String(job.ticker ?? '')}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{String(job.status ?? '')}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {job.created_at
                            ? formatLocaleDateTimeValue(String(job.created_at))
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </PageFrame>
    </AdminGate>
  );
}
