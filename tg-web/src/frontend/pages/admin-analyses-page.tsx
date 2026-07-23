import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenText, FileText, Info, RotateCcw } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { AdminGate } from '@/frontend/components/admin-gate';
import { InstrumentIdentity } from '@/frontend/components/instrument-identity';
import { InstrumentLogo } from '@/frontend/components/instrument-logo';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/frontend/components/ui/sheet';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { useJobMarketIdentities } from '@/frontend/hooks/use-market-identities';
import {
  decisionBadgeVariant,
  formatDecisionLabel,
} from '@/frontend/lib/format-decision';
import {
  formatLocaleCalendarDate,
  formatLocaleDateTimeValue,
} from '@/frontend/lib/format-locale';
import { formatOutputLanguage } from '@/frontend/lib/format-output-language';
import {
  getAdminAnalysis,
  listAdminAnalyses,
  retryAdminAnalysis,
} from '@/frontend/lib/auth';
import {
  displayAnalysisStatus,
  type AnalysisDisplayStatus,
  type AnalysisJob,
  type AssetIdentity,
} from '@/frontend/lib/research';
import { cn } from '@/frontend/lib/utils';
import { formatDisplayTicker } from '@/shared/listing';

type AdminJob = AnalysisJob & {
  request_id?: string | null;
  asset_type?: string | null;
  clerk_user_id?: string;
  user?: {
    display_name?: string | null;
    image_url?: string | null;
    email?: string | null;
  } | null;
  display?: {
    display_name?: string | null;
    english_name?: string | null;
    logo_url?: string | null;
  } | null;
};

type AdminJobDetail = AdminJob & {
  tokens_used?: number | null;
  token_usage?: Record<string, unknown> | null;
  cost_breakdown?: Record<string, unknown> | null;
  credit_pricing?: Record<string, unknown> | null;
  report_path?: string | null;
  request?: Record<string, unknown> | null;
  config?: Record<string, unknown> | null;
  events?: unknown[] | null;
};

function statusVariant(status: AnalysisDisplayStatus) {
  if (status === 'failed') return 'destructive';
  if (status === 'running' || status === 'queued' || status === 'stopping') {
    return 'running';
  }
  if (status === 'succeeded') return 'up';
  return 'secondary';
}

function instrumentTicker(
  job: AdminJob,
  identities: Record<string, AssetIdentity>,
) {
  const key = job.ticker.trim().toUpperCase();
  return identities[key]?.display_ticker ?? formatDisplayTicker(job.ticker);
}

function instrumentName(
  job: AdminJob,
  identities: Record<string, AssetIdentity>,
) {
  const key = job.ticker.trim().toUpperCase();
  return job.display?.display_name ?? identities[key]?.display_name;
}

function instrumentLogo(
  job: AdminJob,
  identities: Record<string, AssetIdentity>,
) {
  const key = job.ticker.trim().toUpperCase();
  return job.display?.logo_url ?? identities[key]?.logo_url;
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-b-0">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  const empty =
    value == null ||
    (typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 0) ||
    (Array.isArray(value) && value.length === 0);
  if (empty) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <pre className="max-h-56 overflow-auto border border-border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
      {formatJson(value)}
    </pre>
  );
}

function jobUserDisplayName(job: AdminJob) {
  const name = job.user?.display_name?.trim();
  return name || null;
}

function jobUserImageUrl(job: AdminJob) {
  const url = job.user?.image_url?.trim();
  return url || null;
}

/** Shorten Clerk IDs for dense tables; full value stays on title/tooltip. */
function shortenClerkUserId(id: string) {
  const trimmed = id.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

function AdminUserCell({
  job,
  compact = false,
}: {
  job: AdminJob;
  /** List rows: shorter id + tighter width. */
  compact?: boolean;
}) {
  if (!job.clerk_user_id) return <>—</>;
  const displayName = jobUserDisplayName(job);
  const imageUrl = jobUserImageUrl(job);
  const fallback = (displayName || job.clerk_user_id).slice(0, 1).toUpperCase();
  const idLabel = compact
    ? shortenClerkUserId(job.clerk_user_id)
    : job.clerk_user_id;

  return (
    <Link
      className={cn(
        'flex min-w-0 items-center gap-2.5',
        compact && 'max-w-[10.5rem]',
      )}
      to={`/admin/users/${encodeURIComponent(job.clerk_user_id)}`}
      title={job.clerk_user_id}
    >
      <Avatar
        className={cn(
          'shrink-0 !rounded-none after:!rounded-none',
          compact ? 'size-7!' : 'size-8!',
        )}
      >
        {imageUrl ? (
          <AvatarImage
            src={imageUrl}
            alt={displayName ?? job.clerk_user_id}
            className="!rounded-none"
          />
        ) : null}
        <AvatarFallback className="!rounded-none text-xs font-semibold">
          {fallback}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-normal hover:underline">
          {displayName || idLabel}
        </p>
        {displayName ? (
          <p
            className={cn(
              'mt-0.5 truncate font-mono text-muted-foreground',
              compact ? 'text-[10px]' : 'text-[11px]',
            )}
          >
            {idLabel}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function AdminAnalysesPage() {
  const { t } = useTranslation(['admin', 'common']);
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>('all');
  const [ticker, setTicker] = useState('');
  const [userId, setUserId] = useState('');
  const [detailJobId, setDetailJobId] = useState<string | null>(null);

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

  const jobs = useMemo(
    () => (analyses.data?.data ?? []) as AdminJob[],
    [analyses.data?.data],
  );
  const { identities } = useJobMarketIdentities(jobs);

  const detail = useQuery({
    queryKey: ['admin-analysis-detail', detailJobId],
    queryFn: () => getAdminAnalysis(detailJobId!),
    enabled: Boolean(detailJobId) && session.data?.data.user.role === 'admin',
  });

  const retry = useMutation({
    mutationFn: (jobId: string) => retryAdminAnalysis(jobId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-analyses'] });
      toast.success(t('admin:analyses.retrySuccess'));
    },
    onError: () => toast.error(t('admin:analyses.retryError')),
  });

  const detailJob = (detail.data?.data ?? null) as AdminJobDetail | null;
  const listJobForDetail = detailJobId
    ? (jobs.find((job) => job.id === detailJobId) ?? null)
    : null;
  const sheetJob = detailJob ?? listJobForDetail;

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
                  <TableHead>{t('admin:analyses.columns.tradeDate')}</TableHead>
                  <TableHead className="w-[10.5rem] max-w-[10.5rem]">
                    {t('admin:analyses.columns.user')}
                  </TableHead>
                  <TableHead className="text-right">
                    {t('admin:analyses.columns.cost')}
                  </TableHead>
                  <TableHead className="text-right">
                    {t('admin:analyses.columns.credits')}
                  </TableHead>
                  <TableHead>{t('admin:analyses.columns.created')}</TableHead>
                  <TableHead>{t('admin:analyses.columns.status')}</TableHead>
                  <TableHead>{t('admin:analyses.columns.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const displayStatus =
                    displayAnalysisStatus(job) ?? job.status;
                  const tickerLabel = instrumentTicker(job, identities);
                  const name = instrumentName(job, identities);
                  const logoUrl = instrumentLogo(job, identities);
                  const detailLabel = t('admin:analyses.detail');
                  const interpretLabel = t('admin:analyses.interpret.action');
                  const openLabel = t('admin:analyses.open');
                  const retryLabel = t('admin:analyses.retry');
                  return (
                    <TableRow key={String(job.id)}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <InstrumentLogo
                            symbol={tickerLabel}
                            logoUrl={logoUrl}
                            alt={t('admin:analyses.logoAlt', {
                              ticker: tickerLabel,
                            })}
                            size="md"
                          />
                          <InstrumentIdentity
                            className="min-w-0"
                            density="compact"
                            name={name}
                            ticker={tickerLabel}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {job.trade_date
                          ? formatLocaleCalendarDate(job.trade_date)
                          : '—'}
                      </TableCell>
                      <TableCell className="max-w-[10.5rem]">
                        <AdminUserCell job={job} compact />
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {job.cost_usd != null && Number(job.cost_usd) > 0
                          ? `$${Number(job.cost_usd).toFixed(4)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {job.credit_units != null && job.credit_units > 0
                          ? String(job.credit_units)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {job.created_at
                          ? formatLocaleDateTimeValue(job.created_at)
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusVariant(displayStatus)}
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {t(`common:status.${displayStatus}`, {
                            defaultValue: displayStatus,
                          })}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon-sm"
                                variant="outline"
                                aria-label={detailLabel}
                                onClick={() => setDetailJobId(job.id)}
                              >
                                <Info />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{detailLabel}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                asChild
                                size="icon-sm"
                                variant="outline"
                                aria-label={interpretLabel}
                              >
                                <Link to={`/admin/analyses/${job.id}`}>
                                  <BookOpenText />
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{interpretLabel}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                asChild
                                size="icon-sm"
                                variant="outline"
                                aria-label={openLabel}
                              >
                                <Link to={`/reports/${job.id}`}>
                                  <FileText />
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{openLabel}</TooltipContent>
                          </Tooltip>
                          {job.status === 'failed' &&
                          displayStatus !== 'cancelled' ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon-sm"
                                  variant="secondary"
                                  aria-label={retryLabel}
                                  disabled={retry.isPending}
                                  onClick={() => retry.mutate(job.id)}
                                >
                                  {retry.isPending &&
                                  retry.variables === job.id ? (
                                    <Spinner />
                                  ) : (
                                    <RotateCcw />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{retryLabel}</TooltipContent>
                            </Tooltip>
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

      <Sheet
        open={Boolean(detailJobId)}
        onOpenChange={(open) => {
          if (!open) setDetailJobId(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader className="border-b border-border">
            <SheetTitle>{t('admin:analyses.detailTitle')}</SheetTitle>
            <SheetDescription>
              {t('admin:analyses.detailSubtitle')}
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-6">
            {detail.isLoading && !sheetJob ? (
              <div className="space-y-3 py-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : detail.isError && !sheetJob ? (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>
                  {t('admin:analyses.detailLoadError.title')}
                </AlertTitle>
                <AlertDescription>
                  {t('admin:analyses.detailLoadError.body')}
                </AlertDescription>
              </Alert>
            ) : sheetJob ? (
              <AdminAnalysisDetailBody
                job={sheetJob}
                identities={identities}
                loadingExtra={detail.isLoading && !detailJob}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </AdminGate>
  );
}

function AdminAnalysisDetailBody({
  job,
  identities,
  loadingExtra,
}: {
  job: AdminJobDetail;
  identities: Record<string, AssetIdentity>;
  loadingExtra?: boolean;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const displayStatus = displayAnalysisStatus(job) ?? job.status;
  const tickerLabel = instrumentTicker(job, identities);
  const name = instrumentName(job, identities);
  const logoUrl = instrumentLogo(job, identities);
  const decisionLabel = formatDecisionLabel(job.decision, (key, options) =>
    t(`common:${key}`, options),
  );
  const analysts = Array.isArray(job.analysts) ? job.analysts : [];

  return (
    <div className="pt-2">
      <div className="flex items-center gap-3 border-b border-border py-3">
        <InstrumentLogo
          symbol={tickerLabel}
          logoUrl={logoUrl}
          alt={t('admin:analyses.logoAlt', { ticker: tickerLabel })}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <InstrumentIdentity
            density="row"
            name={name}
            ticker={tickerLabel}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge
              variant={statusVariant(displayStatus)}
              className="h-5 px-1.5 text-[10px]"
            >
              {t(`common:status.${displayStatus}`, {
                defaultValue: displayStatus,
              })}
            </Badge>
            {decisionLabel ? (
              <Badge
                variant={decisionBadgeVariant(job.decision)}
                className="h-5 px-1.5 text-[10px]"
              >
                {decisionLabel}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <dl>
        <DetailField label={t('admin:analyses.fields.jobId')}>
          <span className="font-mono text-xs break-all">{job.id}</span>
        </DetailField>
        <DetailField label={t('admin:analyses.fields.requestId')}>
          <span className="font-mono text-xs break-all">
            {job.request_id ?? '—'}
          </span>
        </DetailField>
        <DetailField label={t('admin:analyses.fields.user')}>
          <AdminUserCell job={job} />
        </DetailField>
        <DetailField label={t('admin:analyses.fields.exchange')}>
          <span className="font-mono text-xs">{job.exchange ?? '—'}</span>
        </DetailField>
        <DetailField label={t('admin:analyses.fields.tradeDate')}>
          {job.trade_date ?? '—'}
        </DetailField>
        <DetailField label={t('admin:analyses.fields.assetType')}>
          {job.asset_type ?? '—'}
        </DetailField>
        <DetailField label={t('admin:analyses.fields.outputLanguage')}>
          {formatOutputLanguage(job.output_language, (key, options) =>
            t(`common:${key}`, options),
          ) || '—'}
        </DetailField>
        <DetailField label={t('admin:analyses.fields.analysts')}>
          {analysts.length ? (
            <div className="flex flex-wrap gap-1.5">
              {analysts.map((analyst) => (
                <Badge key={analyst} variant="outline" className="text-[10px]">
                  {t(`common:analysts.${analyst}`, {
                    defaultValue: analyst,
                  })}
                </Badge>
              ))}
            </div>
          ) : (
            '—'
          )}
        </DetailField>
        <DetailField label={t('admin:analyses.fields.progress')}>
          {job.progress_percent != null
            ? `${job.progress_percent}%`
            : '—'}
          {job.current_step ? (
            <span className="ml-2 text-muted-foreground">
              · {job.current_step}
            </span>
          ) : null}
        </DetailField>
        <DetailField label={t('admin:analyses.fields.cost')}>
          {job.cost_usd != null
            ? `$${Number(job.cost_usd).toFixed(6)}`
            : '—'}
        </DetailField>
        <DetailField label={t('admin:analyses.fields.tokens')}>
          {job.tokens_used != null ? String(job.tokens_used) : '—'}
        </DetailField>
        <DetailField label={t('admin:analyses.fields.creditUnits')}>
          {job.credit_units != null ? String(job.credit_units) : '—'}
        </DetailField>
        <DetailField label={t('admin:analyses.fields.created')}>
          {job.created_at ? formatLocaleDateTimeValue(job.created_at) : '—'}
        </DetailField>
        <DetailField label={t('admin:analyses.fields.started')}>
          {job.started_at ? formatLocaleDateTimeValue(job.started_at) : '—'}
        </DetailField>
        <DetailField label={t('admin:analyses.fields.finished')}>
          {job.finished_at ? formatLocaleDateTimeValue(job.finished_at) : '—'}
        </DetailField>
        <DetailField label={t('admin:analyses.fields.updated')}>
          {job.updated_at ? formatLocaleDateTimeValue(job.updated_at) : '—'}
        </DetailField>
        {job.error ? (
          <DetailField label={t('admin:analyses.fields.error')}>
            <p className="whitespace-pre-wrap break-words text-destructive">
              {job.error}
            </p>
          </DetailField>
        ) : null}
        <DetailField label={t('admin:analyses.fields.reportPath')}>
          <span className="font-mono text-xs break-all">
            {job.report_path ?? '—'}
          </span>
        </DetailField>
      </dl>

      {loadingExtra ? (
        <div className="space-y-3 py-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          <section className="space-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-medium">
              {t('admin:analyses.sections.tokenUsage')}
            </h3>
            <JsonBlock value={job.token_usage} />
          </section>
          <section className="mt-4 space-y-2">
            <h3 className="text-sm font-medium">
              {t('admin:analyses.sections.costBreakdown')}
            </h3>
            <JsonBlock value={job.cost_breakdown} />
          </section>
          <section className="mt-4 space-y-2">
            <h3 className="text-sm font-medium">
              {t('admin:analyses.sections.creditPricing')}
            </h3>
            <JsonBlock value={job.credit_pricing} />
          </section>
          <section className="mt-4 space-y-2">
            <h3 className="text-sm font-medium">
              {t('admin:analyses.sections.request')}
            </h3>
            <JsonBlock value={job.request} />
          </section>
          <section className="mt-4 space-y-2">
            <h3 className="text-sm font-medium">
              {t('admin:analyses.sections.config')}
            </h3>
            <JsonBlock value={job.config} />
          </section>
          <section className="mt-4 space-y-2">
            <h3 className="text-sm font-medium">
              {t('admin:analyses.sections.events')}
            </h3>
            <JsonBlock value={job.events} />
          </section>
        </>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={`/admin/analyses/${job.id}`}>
            {t('admin:analyses.interpret.action')}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={`/reports/${job.id}`}>{t('admin:analyses.open')}</Link>
        </Button>
      </div>
    </div>
  );
}
