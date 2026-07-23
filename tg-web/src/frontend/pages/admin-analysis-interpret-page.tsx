import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { AdminGate } from '@/frontend/components/admin-gate';
import { InstrumentIdentity } from '@/frontend/components/instrument-identity';
import { InstrumentLogo } from '@/frontend/components/instrument-logo';
import { PageFrame, SectionPanel } from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { useJobMarketIdentities } from '@/frontend/hooks/use-market-identities';
import { interpretAdminAnalysisJob } from '@/frontend/lib/admin-analysis-interpret';
import { getAdminAnalysis } from '@/frontend/lib/auth';
import {
  decisionBadgeVariant,
  formatDecisionLabel,
} from '@/frontend/lib/format-decision';
import { formatLocaleCalendarDate } from '@/frontend/lib/format-locale';
import {
  displayAnalysisStatus,
  type AnalysisDisplayStatus,
  type AnalysisJob,
  type AssetIdentity,
} from '@/frontend/lib/research';
import { formatDisplayTicker } from '@/shared/listing';

type AdminJobDetail = AnalysisJob & {
  request_id?: string | null;
  asset_type?: string | null;
  clerk_user_id?: string;
  tokens_used?: number | null;
  token_usage?: Record<string, unknown> | null;
  cost_breakdown?: Record<string, unknown> | null;
  credit_pricing?: Record<string, unknown> | null;
  report_path?: string | null;
  request?: Record<string, unknown> | null;
  config?: Record<string, unknown> | null;
  events?: unknown[] | null;
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

function statusVariant(status: AnalysisDisplayStatus) {
  if (status === 'failed') return 'destructive';
  if (status === 'running' || status === 'queued' || status === 'stopping') {
    return 'running';
  }
  if (status === 'succeeded') return 'up';
  return 'secondary';
}

function instrumentTicker(
  job: AdminJobDetail,
  identities: Record<string, AssetIdentity>,
) {
  const key = job.ticker.trim().toUpperCase();
  return identities[key]?.display_ticker ?? formatDisplayTicker(job.ticker);
}

function instrumentName(
  job: AdminJobDetail,
  identities: Record<string, AssetIdentity>,
) {
  const key = job.ticker.trim().toUpperCase();
  return job.display?.display_name ?? identities[key]?.display_name;
}

function instrumentLogo(
  job: AdminJobDetail,
  identities: Record<string, AssetIdentity>,
) {
  const key = job.ticker.trim().toUpperCase();
  return job.display?.logo_url ?? identities[key]?.logo_url;
}

function InterpretRowList({
  rows,
  emptyLabel,
  fieldLabel,
}: {
  rows: ReturnType<typeof interpretAdminAnalysisJob>[number]['rows'];
  emptyLabel: string;
  fieldLabel: (fieldKey: string) => string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <dl className="divide-y divide-border">
      {rows.map((row, index) => (
        <div
          key={`${row.fieldKey}-${row.note ?? ''}-${index}`}
          className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(8rem,12rem)_1fr] sm:gap-4"
        >
          <dt className="text-xs font-medium tracking-wide text-muted-foreground">
            {fieldLabel(row.fieldKey)}
            {row.note ? (
              <span className="mt-0.5 block font-mono text-[11px] font-normal normal-case tracking-normal text-muted-foreground/80">
                {row.note}
              </span>
            ) : null}
          </dt>
          <dd className="min-w-0 text-sm break-words text-foreground">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AdminAnalysisInterpretPage() {
  const { t } = useTranslation(['admin', 'common']);
  const { id = '' } = useParams();
  const session = useAuthSession();
  const detail = useQuery({
    queryKey: ['admin-analysis-detail', id],
    queryFn: () => getAdminAnalysis(id),
    enabled: Boolean(id) && session.data?.data.user.role === 'admin',
  });

  const job = (detail.data?.data ?? null) as AdminJobDetail | null;
  const jobs = useMemo(() => (job ? [job] : []), [job]);
  const { identities } = useJobMarketIdentities(jobs);
  const sections = useMemo(
    () => (job ? interpretAdminAnalysisJob(job) : []),
    [job],
  );

  const displayStatus = job
    ? (displayAnalysisStatus(job) ?? job.status)
    : undefined;
  const tickerLabel = job ? instrumentTicker(job, identities) : '';
  const name = job ? instrumentName(job, identities) : undefined;
  const logoUrl = job ? instrumentLogo(job, identities) : undefined;
  const decisionLabel = job
    ? formatDecisionLabel(job.decision, (key, options) =>
        t(`common:${key}`, options),
      )
    : null;

  return (
    <AdminGate
      accessTitle={t('admin:analyses.accessRequired.title')}
      accessBody={t('admin:analyses.accessRequired.body')}
      loading={detail.isLoading}
    >
      {detail.isError || (!detail.isLoading && !job) ? (
        <PageFrame
          title={t('admin:analyses.interpret.loadError.title')}
          description={
            <div className="space-y-2">
              <Button
                asChild
                variant="outline"
                size="icon-sm"
                aria-label={t('admin:analyses.interpret.back')}
              >
                <Link to="/admin/analyses">
                  <ArrowLeft />
                </Link>
              </Button>
              <p>{t('admin:analyses.interpret.loadError.body')}</p>
            </div>
          }
        >
          <Alert variant="destructive">
            <AlertTitle>
              {t('admin:analyses.interpret.loadError.title')}
            </AlertTitle>
            <AlertDescription>
              {t('admin:analyses.interpret.loadError.body')}
            </AlertDescription>
          </Alert>
        </PageFrame>
      ) : !job ? (
        <PageFrame title={t('admin:analyses.interpret.heading')}>
          <Skeleton className="h-64 w-full" />
        </PageFrame>
      ) : (
        <PageFrame
          title={t('admin:analyses.interpret.heading')}
          description={
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Button
                  asChild
                  variant="outline"
                  size="icon-sm"
                  aria-label={t('admin:analyses.interpret.back')}
                >
                  <Link to="/admin/analyses">
                    <ArrowLeft />
                  </Link>
                </Button>
                <InstrumentLogo
                  symbol={tickerLabel}
                  logoUrl={logoUrl}
                  alt={t('admin:analyses.logoAlt', { ticker: tickerLabel })}
                  size="lg"
                />
                <div className="min-w-0">
                  <InstrumentIdentity
                    density="row"
                    name={name}
                    ticker={tickerLabel}
                  />
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {displayStatus ? (
                      <Badge
                        variant={statusVariant(displayStatus)}
                        className="h-5 px-1.5 text-[10px]"
                      >
                        {t(`common:status.${displayStatus}`, {
                          defaultValue: displayStatus,
                        })}
                      </Badge>
                    ) : null}
                    {decisionLabel ? (
                      <Badge
                        variant={decisionBadgeVariant(job.decision)}
                        className="h-5 px-1.5 text-[10px]"
                      >
                        {decisionLabel}
                      </Badge>
                    ) : null}
                    {job.trade_date ? (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatLocaleCalendarDate(job.trade_date)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('admin:analyses.interpret.subtitle')}
              </p>
            </div>
          }
          actions={
            <Button asChild size="sm" variant="outline">
              <Link to={`/reports/${job.id}`}>{t('admin:analyses.open')}</Link>
            </Button>
          }
        >
          <div className="space-y-4">
            {sections.map((section) => (
              <SectionPanel
                key={section.sectionKey}
                title={t(`admin:analyses.sections.${section.sectionKey}`)}
              >
                <InterpretRowList
                  rows={section.rows}
                  emptyLabel={t('admin:analyses.interpret.empty')}
                  fieldLabel={(fieldKey) =>
                    t(`admin:analyses.interpret.fields.${fieldKey}`, {
                      defaultValue: fieldKey,
                    })
                  }
                />
              </SectionPanel>
            ))}
          </div>
        </PageFrame>
      )}
    </AdminGate>
  );
}
