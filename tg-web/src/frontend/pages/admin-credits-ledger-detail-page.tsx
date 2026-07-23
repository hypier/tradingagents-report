import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';

import { AdminGate } from '@/frontend/components/admin-gate';
import { PageFrame, SectionPanel } from '@/frontend/components/page-chrome';
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
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import {
  entryTypeBadgeVariant,
  formatCreditDelta,
  localizeEntryType,
  localizeLedgerActivity,
  localizeLedgerPool,
  localizeReferenceType,
  resolveLedgerPoolDeltas,
  type BillingLedgerEntry,
} from '@/frontend/lib/billing-ui';
import { formatLocaleDateTimeValue } from '@/frontend/lib/format-locale';
import {
  getAdminCreditLedgerEntry,
  type AdminLedgerEntry,
} from '@/frontend/lib/auth';
import { cn } from '@/frontend/lib/utils';

function toBillingLedgerEntry(entry: AdminLedgerEntry): BillingLedgerEntry {
  return {
    id: entry.id,
    clerkUserId: entry.clerk_user_id,
    entryType: entry.entry_type,
    availableDelta: entry.available_delta,
    reservedDelta: entry.reserved_delta,
    spentDelta: entry.spent_delta,
    idempotencyKey: entry.idempotency_key,
    referenceType: entry.reference_type,
    referenceId: entry.reference_id,
    description: entry.description,
    metadata: entry.metadata,
    createdAt: entry.created_at,
    analysisReport: entry.analysis_report
      ? {
          id: entry.analysis_report.id,
          ticker: entry.analysis_report.ticker,
          displayName: entry.analysis_report.display_name ?? null,
          displayTicker: entry.analysis_report.display_ticker ?? null,
          tradeDate: entry.analysis_report.trade_date ?? '',
        }
      : null,
  } as unknown as BillingLedgerEntry;
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-sm break-words text-foreground">{children}</dd>
    </div>
  );
}

export function AdminCreditsLedgerDetailPage() {
  const { t } = useTranslation(['admin', 'billing', 'common']);
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const session = useAuthSession();
  const detail = useQuery({
    queryKey: ['admin-credit-ledger-entry', id],
    queryFn: () => getAdminCreditLedgerEntry(id),
    enabled: Boolean(id) && session.data?.data.user.role === 'admin',
  });

  const entry = (detail.data?.data ?? null) as AdminLedgerEntry | null;
  const billingEntry = entry ? toBillingLedgerEntry(entry) : null;
  const pools = billingEntry ? resolveLedgerPoolDeltas(billingEntry) : null;
  const name = entry?.user?.display_name?.trim() || null;
  const imageUrl = entry?.user?.image_url?.trim() || null;

  function goBack() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/admin/credits');
  }

  return (
    <AdminGate
      accessTitle={t('admin:credits.accessRequired.title')}
      accessBody={t('admin:credits.accessRequired.body')}
      loading={detail.isLoading}
    >
      {detail.isError || (!detail.isLoading && !entry) ? (
        <PageFrame
          title={t('admin:credits.detailLoadError.title')}
          description={
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t('admin:credits.back')}
              onClick={goBack}
            >
              <ArrowLeft />
            </Button>
          }
        >
          <Alert variant="destructive">
            <AlertTitle>{t('admin:credits.detailLoadError.title')}</AlertTitle>
            <AlertDescription>
              {t('admin:credits.detailLoadError.body')}
            </AlertDescription>
          </Alert>
        </PageFrame>
      ) : !entry || !billingEntry ? (
        <PageFrame title={t('admin:credits.detailHeading')}>
          <Skeleton className="h-64 w-full" />
        </PageFrame>
      ) : (
        <PageFrame
          title={t('admin:credits.detailHeading')}
          description={
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t('admin:credits.back')}
                onClick={goBack}
              >
                <ArrowLeft />
              </Button>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">
                  {localizeLedgerActivity(billingEntry, t)}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {formatLocaleDateTimeValue(entry.created_at)}
                </p>
              </div>
            </div>
          }
          actions={
            entry.reference_type === 'analysis_job' ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`/admin/analyses/${entry.reference_id}`}>
                  {t('admin:credits.openAnalysis')}
                </Link>
              </Button>
            ) : null
          }
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionPanel title={t('admin:credits.sections.summary')}>
              <dl className="grid gap-x-6 sm:grid-cols-2">
                <DetailRow label={t('admin:credits.fields.entryId')}>
                  <span className="font-mono text-xs break-all">{entry.id}</span>
                </DetailRow>
                <DetailRow label={t('admin:credits.fields.type')}>
                  <Badge variant={entryTypeBadgeVariant(entry.entry_type)}>
                    {localizeEntryType(entry.entry_type, t)}
                  </Badge>
                </DetailRow>
                <DetailRow label={t('admin:credits.fields.activity')}>
                  {localizeLedgerActivity(billingEntry, t)}
                </DetailRow>
                <DetailRow label={t('admin:credits.fields.when')}>
                  {formatLocaleDateTimeValue(entry.created_at)}
                </DetailRow>
                <DetailRow label={t('admin:credits.fields.availableDelta')}>
                  <span
                    className={cn(
                      'font-mono tabular-nums',
                      entry.available_delta < 0
                        ? 'text-destructive'
                        : entry.available_delta > 0
                          ? 'text-market-up'
                          : undefined,
                    )}
                  >
                    {formatCreditDelta(entry.available_delta)}
                  </span>
                </DetailRow>
                <DetailRow label={t('admin:credits.fields.spentDelta')}>
                  <span className="font-mono tabular-nums">
                    {formatCreditDelta(entry.spent_delta)}
                  </span>
                </DetailRow>
                <DetailRow label={t('admin:credits.fields.reservedDelta')}>
                  <span className="font-mono tabular-nums">
                    {formatCreditDelta(entry.reserved_delta)}
                  </span>
                </DetailRow>
                {pools && (pools.period != null || pools.bonus != null) ? (
                  <DetailRow label={t('admin:credits.fields.pools')}>
                    <div className="flex flex-wrap gap-2">
                      {pools.period ? (
                        <Badge variant="secondary">
                          {localizeLedgerPool(
                            {
                              ...billingEntry,
                              metadata: {
                                ...billingEntry.metadata,
                                pool: 'period',
                              },
                            },
                            t,
                          )}{' '}
                          {formatCreditDelta(pools.period)}
                        </Badge>
                      ) : null}
                      {pools.bonus ? (
                        <Badge variant="secondary">
                          {localizeLedgerPool(
                            {
                              ...billingEntry,
                              metadata: {
                                ...billingEntry.metadata,
                                pool: 'bonus',
                              },
                            },
                            t,
                          )}{' '}
                          {formatCreditDelta(pools.bonus)}
                        </Badge>
                      ) : null}
                    </div>
                  </DetailRow>
                ) : null}
              </dl>
            </SectionPanel>

            <SectionPanel title={t('admin:credits.sections.user')}>
              <dl className="grid gap-x-6 sm:grid-cols-2">
                <DetailRow label={t('admin:credits.fields.user')}>
                  <Link
                    className="inline-flex items-center gap-2 hover:underline"
                    to={`/admin/users/${encodeURIComponent(entry.clerk_user_id)}`}
                  >
                    <Avatar className="size-7! shrink-0 !rounded-none after:!rounded-none">
                      {imageUrl ? (
                        <AvatarImage
                          src={imageUrl}
                          alt={name ?? entry.clerk_user_id}
                          className="!rounded-none"
                        />
                      ) : null}
                      <AvatarFallback className="!rounded-none text-xs font-semibold">
                        {(name || entry.clerk_user_id).slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span>{name || entry.clerk_user_id}</span>
                  </Link>
                </DetailRow>
                <DetailRow label={t('admin:credits.fields.userId')}>
                  <span className="font-mono text-xs break-all">
                    {entry.clerk_user_id}
                  </span>
                </DetailRow>
                {entry.user?.email ? (
                  <DetailRow label={t('admin:credits.fields.email')}>
                    {entry.user.email}
                  </DetailRow>
                ) : null}
              </dl>
            </SectionPanel>

            <SectionPanel title={t('admin:credits.sections.reference')}>
              <dl className="grid gap-x-6 sm:grid-cols-2">
                <DetailRow label={t('admin:credits.fields.referenceType')}>
                  <span className="text-sm">
                    {localizeReferenceType(entry.reference_type, t)}
                  </span>
                </DetailRow>
                <DetailRow label={t('admin:credits.fields.referenceId')}>
                  {entry.reference_type === 'analysis_job' ? (
                    <Link
                      className="font-mono text-xs break-all underline"
                      to={`/admin/analyses/${entry.reference_id}`}
                    >
                      {entry.reference_id}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs break-all">
                      {entry.reference_id}
                    </span>
                  )}
                </DetailRow>
                {entry.analysis_report ? (
                  <>
                    <DetailRow label={t('admin:credits.fields.ticker')}>
                      {entry.analysis_report.display_name ||
                        entry.analysis_report.display_ticker ||
                        entry.analysis_report.ticker}
                    </DetailRow>
                    <DetailRow label={t('admin:credits.fields.tradeDate')}>
                      {entry.analysis_report.trade_date || '—'}
                    </DetailRow>
                  </>
                ) : null}
                <DetailRow label={t('admin:credits.fields.idempotencyKey')}>
                  <span className="font-mono text-xs break-all">
                    {entry.idempotency_key}
                  </span>
                </DetailRow>
                <DetailRow label={t('admin:credits.fields.description')}>
                  {entry.description || '—'}
                </DetailRow>
              </dl>
            </SectionPanel>

            <SectionPanel title={t('admin:credits.sections.metadata')}>
              {Object.keys(entry.metadata ?? {}).length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <pre className="max-h-80 overflow-auto border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              )}
            </SectionPanel>
          </div>
        </PageFrame>
      )}
    </AdminGate>
  );
}
