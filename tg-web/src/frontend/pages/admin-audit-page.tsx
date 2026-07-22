import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
import { Button } from '@/frontend/components/ui/button';
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

function formatMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || Object.keys(metadata).length === 0) return '—';
  try {
    return JSON.stringify(metadata);
  } catch {
    return '—';
  }
}

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

  function onFilter(event: FormEvent) {
    event.preventDefault();
    setApplied({
      action: action.trim(),
      actor: actor.trim(),
    });
  }

  return (
    <AdminGate
      accessTitle={t('audit.accessRequired.title')}
      accessBody={t('audit.accessRequired.body')}
    >
      <PageFrame
        title={t('audit.heading')}
        description={t('audit.subtitle')}
        bodyClassName="gap-0 p-0"
        toolbar={
          <PageToolbar>
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
          </PageToolbar>
        }
      >
        {audit.isLoading ? (
          <div className="px-5 py-5 lg:px-6">
            <Skeleton className="h-64 w-full rounded-none" />
          </div>
        ) : audit.isError ? (
          <div className="px-5 py-5 lg:px-6">
            <Alert variant="destructive">
              <AlertTitle>{t('audit.loadError.title')}</AlertTitle>
              <AlertDescription>{t('audit.loadError.body')}</AlertDescription>
            </Alert>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5 lg:pl-6">
                  {t('audit.columns.when')}
                </TableHead>
                <TableHead>{t('audit.columns.actor')}</TableHead>
                <TableHead>{t('audit.columns.action')}</TableHead>
                <TableHead>{t('audit.columns.target')}</TableHead>
                <TableHead className="pr-5 lg:pr-6">
                  {t('audit.columns.detail')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(audit.data?.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="px-5 text-muted-foreground lg:px-6"
                  >
                    {t('audit.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                (audit.data?.data ?? []).map((row) => (
                  <TableRow key={row.id} className="h-11">
                    <TableCell className="pl-5 font-mono text-xs tabular-nums lg:pl-6">
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
                    <TableCell
                      className="max-w-sm truncate pr-5 font-mono text-xs text-muted-foreground lg:pr-6"
                      title={formatMetadata(row.metadata)}
                    >
                      {formatMetadata(row.metadata)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </PageFrame>
    </AdminGate>
  );
}
