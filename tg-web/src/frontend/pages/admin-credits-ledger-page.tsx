import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Info, Search } from 'lucide-react';

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
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
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
import {
  entryTypeBadgeVariant,
  formatCreditDelta,
  localizeEntryType,
  localizeLedgerActivity,
  localizeReferenceType,
  type BillingLedgerEntry,
} from '@/frontend/lib/billing-ui';
import { formatLocaleDateTimeValue } from '@/frontend/lib/format-locale';
import {
  listAdminCreditLedger,
  type AdminLedgerEntry,
} from '@/frontend/lib/auth';
import { cn } from '@/frontend/lib/utils';

const ENTRY_TYPES = [
  'all',
  'grant',
  'consume',
  'adjustment',
  'expire',
  'clawback',
  'reserve',
  'release',
] as const;

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

function shortenId(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function LedgerUserCell({ entry }: { entry: AdminLedgerEntry }) {
  const name = entry.user?.display_name?.trim() || null;
  const imageUrl = entry.user?.image_url?.trim() || null;
  const fallback = (name || entry.clerk_user_id).slice(0, 1).toUpperCase();
  return (
    <Link
      className="flex max-w-[10.5rem] min-w-0 items-center gap-2"
      to={`/admin/users/${encodeURIComponent(entry.clerk_user_id)}`}
      title={entry.clerk_user_id}
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
          {fallback}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm hover:underline">
          {name || shortenId(entry.clerk_user_id)}
        </p>
        {name ? (
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
            {shortenId(entry.clerk_user_id)}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function AdminCreditsLedgerPage() {
  const { t } = useTranslation(['admin', 'billing', 'common']);
  const session = useAuthSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialUserId = searchParams.get('clerkUserId') ?? '';
  const initialEntryType = searchParams.get('entryType') ?? 'all';
  const initialReferenceId = searchParams.get('referenceId') ?? '';

  const [userId, setUserId] = useState(initialUserId);
  const [entryType, setEntryType] = useState(initialEntryType);
  const [referenceId, setReferenceId] = useState(initialReferenceId);
  const [applied, setApplied] = useState({
    userId: initialUserId,
    entryType: initialEntryType,
    referenceId: initialReferenceId,
  });

  const ledger = useQuery({
    queryKey: ['admin-credit-ledger', applied],
    queryFn: () =>
      listAdminCreditLedger({
        clerkUserId: applied.userId.trim() || undefined,
        entryType:
          applied.entryType !== 'all' ? applied.entryType : undefined,
        referenceId: applied.referenceId.trim() || undefined,
        limit: 100,
      }),
    enabled: session.data?.data.user.role === 'admin',
  });

  const rows = useMemo(
    () => (ledger.data?.data ?? []) as AdminLedgerEntry[],
    [ledger.data?.data],
  );

  function onFilter(event: FormEvent) {
    event.preventDefault();
    const next = {
      userId: userId.trim(),
      entryType,
      referenceId: referenceId.trim(),
    };
    setApplied(next);
    const params = new URLSearchParams();
    if (next.userId) params.set('clerkUserId', next.userId);
    if (next.entryType !== 'all') params.set('entryType', next.entryType);
    if (next.referenceId) params.set('referenceId', next.referenceId);
    setSearchParams(params, { replace: true });
  }

  return (
    <AdminGate
      accessTitle={t('admin:credits.accessRequired.title')}
      accessBody={t('admin:credits.accessRequired.body')}
    >
      <PageFrame
        title={t('admin:credits.heading')}
        description={t('admin:credits.subtitle')}
        bodyClassName="gap-0 p-0"
        toolbar={
          <PageToolbar>
            <form
              onSubmit={onFilter}
              className="flex flex-wrap items-end gap-3"
            >
              <Select value={entryType} onValueChange={setEntryType}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTRY_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === 'all'
                        ? t('admin:credits.entryTypeAll')
                        : localizeEntryType(value, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder={t('admin:credits.userPlaceholder')}
                className="min-w-[12rem] flex-1 basis-40 font-mono"
              />
              <Input
                value={referenceId}
                onChange={(event) => setReferenceId(event.target.value)}
                placeholder={t('admin:credits.referencePlaceholder')}
                className="min-w-[12rem] flex-1 basis-40 font-mono"
              />
              <Button type="submit" variant="secondary">
                <Search data-icon="inline-start" />
                {t('admin:credits.filter')}
              </Button>
            </form>
          </PageToolbar>
        }
      >
        {ledger.isLoading ? (
          <div className="p-5">
            <Skeleton className="h-64 w-full" />
          </div>
        ) : ledger.isError ? (
          <div className="p-5">
            <Alert variant="destructive">
              <AlertTitle>{t('admin:credits.loadError.title')}</AlertTitle>
              <AlertDescription>
                {t('admin:credits.loadError.body')}
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin:credits.columns.when')}</TableHead>
                  <TableHead>{t('admin:credits.columns.user')}</TableHead>
                  <TableHead>{t('admin:credits.columns.type')}</TableHead>
                  <TableHead className="text-right">
                    {t('admin:credits.columns.delta')}
                  </TableHead>
                  <TableHead>{t('admin:credits.columns.activity')}</TableHead>
                  <TableHead>{t('admin:credits.columns.reference')}</TableHead>
                  <TableHead className="w-[4.5rem] text-right">
                    {t('admin:credits.columns.detail')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {t('admin:credits.empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((entry) => {
                    const delta = entry.available_delta;
                    return (
                      <TableRow key={entry.id} className="hover:bg-muted/30">
                        <TableCell className="text-xs text-muted-foreground">
                          {formatLocaleDateTimeValue(entry.created_at)}
                        </TableCell>
                        <TableCell>
                          <LedgerUserCell entry={entry} />
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={entryTypeBadgeVariant(entry.entry_type)}
                            className="text-[10px]"
                          >
                            {localizeEntryType(entry.entry_type, t)}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-mono text-xs tabular-nums',
                            delta < 0
                              ? 'text-destructive'
                              : delta > 0
                                ? 'text-market-up'
                                : 'text-muted-foreground',
                          )}
                        >
                          {formatCreditDelta(delta)}
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate text-sm">
                          {localizeLedgerActivity(
                            toBillingLedgerEntry(entry),
                            t,
                          )}
                        </TableCell>
                        <TableCell className="max-w-[10rem]">
                          {entry.reference_type === 'analysis_job' &&
                          entry.analysis_report ? (
                            <Link
                              className="truncate font-mono text-xs hover:underline"
                              to={`/admin/analyses/${entry.reference_id}`}
                            >
                              {entry.analysis_report.display_ticker ||
                                entry.analysis_report.ticker}
                            </Link>
                          ) : (
                            <span
                              className="block truncate text-xs text-muted-foreground"
                              title={`${entry.reference_type}:${entry.reference_id}`}
                            >
                              {localizeReferenceType(entry.reference_type, t)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                asChild
                                size="icon-sm"
                                variant="outline"
                                aria-label={t('admin:credits.viewDetail')}
                              >
                                <Link to={`/admin/credits/${entry.id}`}>
                                  <Info />
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t('admin:credits.viewDetail')}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </PageFrame>
    </AdminGate>
  );
}
