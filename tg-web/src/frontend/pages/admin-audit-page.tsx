import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { Info, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

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
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/frontend/components/ui/avatar';
import { Button } from '@/frontend/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/frontend/components/ui/dialog';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { formatLocaleDateTimeValue } from '@/frontend/lib/format-locale';
import {
  listAdminAudit,
  type AuditEvent,
} from '@/frontend/lib/admin-ops';

function formatMetadataPreview(
  metadata: Record<string, unknown> | null | undefined,
) {
  if (!metadata || Object.keys(metadata).length === 0) return '—';
  try {
    return JSON.stringify(metadata);
  } catch {
    return '—';
  }
}

function formatMetadataPretty(
  metadata: Record<string, unknown> | null | undefined,
) {
  if (!metadata || Object.keys(metadata).length === 0) return null;
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return null;
  }
}

function localizeAuditAction(action: string, t: TFunction) {
  const label = t(`audit.actions.${action}`, { defaultValue: '' });
  return label || action;
}

function shortenClerkUserId(id: string) {
  const trimmed = id.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

function AuditActorCell({
  event,
  compact = false,
}: {
  event: AuditEvent;
  compact?: boolean;
}) {
  const name = event.user?.display_name?.trim() || null;
  const imageUrl = event.user?.image_url?.trim() || null;
  const fallback = (name || event.actorClerkUserId).slice(0, 1).toUpperCase();
  const idLabel = compact
    ? shortenClerkUserId(event.actorClerkUserId)
    : event.actorClerkUserId;

  return (
    <Link
      className={
        compact
          ? 'flex max-w-[10.5rem] min-w-0 items-center gap-2'
          : 'flex min-w-0 items-center gap-2.5'
      }
      to={`/admin/users/${encodeURIComponent(event.actorClerkUserId)}`}
      title={event.actorClerkUserId}
    >
      <Avatar
        className={
          compact
            ? 'size-7! shrink-0 !rounded-none after:!rounded-none'
            : 'size-8! shrink-0 !rounded-none after:!rounded-none'
        }
      >
        {imageUrl ? (
          <AvatarImage
            src={imageUrl}
            alt={name ?? event.actorClerkUserId}
            className="!rounded-none"
          />
        ) : null}
        <AvatarFallback className="!rounded-none text-xs font-semibold">
          {fallback}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm hover:underline">{name || idLabel}</p>
        {name ? (
          <p
            className={
              compact
                ? 'mt-0.5 truncate font-mono text-[10px] text-muted-foreground'
                : 'mt-0.5 truncate font-mono text-[11px] text-muted-foreground'
            }
          >
            {idLabel}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function AdminAuditPage() {
  const { t } = useTranslation('admin');
  const session = useAuthSession();
  const isAdmin = session.data?.data.user.role === 'admin';
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [applied, setApplied] = useState({ action: '', actor: '' });
  const [detailEvent, setDetailEvent] = useState<AuditEvent | null>(null);

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

  const detailPretty = formatMetadataPretty(detailEvent?.metadata);
  const detailTarget =
    detailEvent &&
    [detailEvent.targetType, detailEvent.targetId]
      .filter(Boolean)
      .join(' · ');

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
                (audit.data?.data ?? []).map((row) => {
                  const preview = formatMetadataPreview(row.metadata);
                  const hasDetail = preview !== '—';
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="pl-5 font-mono text-xs tabular-nums lg:pl-6">
                        {formatLocaleDateTimeValue(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <AuditActorCell event={row} compact />
                      </TableCell>
                      <TableCell
                        className="max-w-[12rem] truncate"
                        title={row.action}
                      >
                        {localizeAuditAction(row.action, t)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs">
                        {[row.targetType, row.targetId]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </TableCell>
                      <TableCell className="pr-5 lg:pr-6">
                        <div className="flex max-w-sm items-center gap-2">
                          <span
                            className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
                            title={preview}
                          >
                            {preview}
                          </span>
                          {hasDetail ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon-sm"
                                  variant="outline"
                                  aria-label={t('audit.viewDetail')}
                                  onClick={() => setDetailEvent(row)}
                                >
                                  <Info />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t('audit.viewDetail')}
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </PageFrame>

      <Dialog
        open={Boolean(detailEvent)}
        onOpenChange={(open) => {
          if (!open) setDetailEvent(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('audit.detailTitle')}</DialogTitle>
            <DialogDescription>{t('audit.detailSubtitle')}</DialogDescription>
          </DialogHeader>
          {detailEvent ? (
            <div className="grid gap-3 text-sm">
              <div className="grid gap-1">
                <span className="text-xs font-medium tracking-wide text-muted-foreground">
                  {t('audit.columns.action')}
                </span>
                <span title={detailEvent.action}>
                  {localizeAuditAction(detailEvent.action, t)}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {detailEvent.action}
                </span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-medium tracking-wide text-muted-foreground">
                  {t('audit.columns.when')}
                </span>
                <span className="font-mono text-xs tabular-nums">
                  {formatLocaleDateTimeValue(detailEvent.createdAt)}
                </span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-medium tracking-wide text-muted-foreground">
                  {t('audit.columns.actor')}
                </span>
                <AuditActorCell event={detailEvent} />
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-medium tracking-wide text-muted-foreground">
                  {t('audit.columns.target')}
                </span>
                <span className="break-all text-xs">
                  {detailTarget || '—'}
                </span>
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-medium tracking-wide text-muted-foreground">
                  {t('audit.columns.detail')}
                </span>
                {detailPretty ? (
                  <pre className="max-h-[50vh] overflow-auto border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                    {detailPretty}
                  </pre>
                ) : (
                  <span className="text-muted-foreground">
                    {t('audit.detailEmpty')}
                  </span>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailEvent(null)}>
              {t('audit.detailClose')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminGate>
  );
}
