import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AppShell } from '@/frontend/components/app-shell';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Button } from '@/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { Skeleton } from '@/frontend/components/ui/skeleton';
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
import { listAdminAudit } from '@/frontend/lib/admin-ops';

export function AdminAuditPage() {
  const { t } = useTranslation('admin');
  const session = useAuthSession();
  const isAdmin = session.data?.data.user.role === 'admin';
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [applied, setApplied] = useState({ action: '', actor: '' });

  const audit = useQuery({
    queryKey: ['admin-audit', applied],
    queryFn: () =>
      listAdminAudit({
        action: applied.action || undefined,
        actor: applied.actor || undefined,
        limit: 100,
      }),
    enabled: isAdmin,
  });

  if (session.isLoading) {
    return (
      <AppShell title={t('audit.title')}>
        <div className="px-4 py-6 lg:px-6">
          <Skeleton className="h-72 w-full" />
        </div>
      </AppShell>
    );
  }

  if (session.isError || !isAdmin) {
    return (
      <AppShell title={t('audit.title')}>
        <div className="px-4 py-6 lg:px-6">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>{t('audit.accessRequired.title')}</AlertTitle>
            <AlertDescription>
              {t('audit.accessRequired.body')}
            </AlertDescription>
          </Alert>
        </div>
      </AppShell>
    );
  }

  function onFilter(event: FormEvent) {
    event.preventDefault();
    setApplied({
      action: action.trim(),
      actor: actor.trim(),
    });
  }

  return (
    <AppShell title={t('audit.title')}>
      <div className="flex flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('audit.heading')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('audit.subtitle')}</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>{t('audit.filterTitle')}</CardTitle>
            <CardDescription>{t('audit.filterDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={onFilter}
              className="flex flex-wrap items-end gap-3"
            >
              <Input
                className="max-w-xs"
                placeholder={t('audit.actionPlaceholder')}
                value={action}
                onChange={(event) => setAction(event.target.value)}
              />
              <Input
                className="max-w-xs"
                placeholder={t('audit.actorPlaceholder')}
                value={actor}
                onChange={(event) => setActor(event.target.value)}
              />
              <Button type="submit">
                <Search data-icon="inline-start" />
                {t('audit.filter')}
              </Button>
            </form>
          </CardContent>
        </Card>

        {audit.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : audit.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t('audit.loadError.title')}</AlertTitle>
            <AlertDescription>{t('audit.loadError.body')}</AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('audit.columns.when')}</TableHead>
                    <TableHead>{t('audit.columns.actor')}</TableHead>
                    <TableHead>{t('audit.columns.action')}</TableHead>
                    <TableHead>{t('audit.columns.target')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(audit.data?.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        {t('audit.empty')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    (audit.data?.data ?? []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          {formatLocaleDateTimeValue(row.createdAt)}
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate font-mono text-xs">
                          {row.actorClerkUserId}
                        </TableCell>
                        <TableCell>{row.action}</TableCell>
                        <TableCell className="max-w-xs truncate text-xs">
                          {[row.targetType, row.targetId]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
