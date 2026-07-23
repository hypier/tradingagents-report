import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Coins,
  CreditCard,
  Lock,
  RotateCcw,
  Timer,
  UsersRound,
  Wallet,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AdminGate } from '@/frontend/components/admin-gate';
import {
  PageFrame,
  SectionPanel,
  StatTile,
} from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import type { AdminOverview } from '@/frontend/lib/auth';
import { getAdminOverview } from '@/frontend/lib/auth';
import {
  formatLocaleCurrency,
  formatLocaleDateTime,
  formatLocaleNumber,
} from '@/frontend/lib/format-locale';
import { cn } from '@/frontend/lib/utils';

const OVERVIEW_DAYS = 30;

function formatDurationSeconds(
  seconds: number | null,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (seconds == null) return '-';
  if (seconds < 60) {
    return t('overview.duration.seconds', {
      value: formatLocaleNumber(Number(seconds.toFixed(1))),
    });
  }
  const minutes = seconds / 60;
  return t('overview.duration.minutes', {
    value: formatLocaleNumber(Number(minutes.toFixed(1))),
  });
}

function formatSuccessRate(rate: number | null) {
  if (rate == null) return '-';
  return `${(rate * 100).toFixed(1)}%`;
}

function buildAttentionItems(
  data: AdminOverview,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const items: Array<{ key: string; message: string; href?: string }> = [];
  const stripe = data.stripe;

  if (!stripe?.configured) {
    items.push({
      key: 'stripe-unconfigured',
      message: t('overview.attention.stripeUnconfigured'),
      href: '/admin/billing',
    });
  } else if (stripe.connectionHealthy === false) {
    items.push({
      key: 'stripe-unhealthy',
      message: t('overview.attention.stripeUnhealthy'),
      href: '/admin/billing',
    });
  }

  const webhookFailures = stripe?.period?.webhookFailedCount ?? 0;
  if (webhookFailures > 0) {
    items.push({
      key: 'webhook-failures',
      message: t('overview.attention.webhookFailures', {
        count: formatLocaleNumber(webhookFailures),
      }),
      href: '/admin/billing?tab=events',
    });
  }

  const paymentFailures = stripe?.period?.paymentFailureCount ?? 0;
  if (paymentFailures > 0) {
    items.push({
      key: 'payment-failures',
      message: t('overview.attention.paymentFailures', {
        count: formatLocaleNumber(paymentFailures),
      }),
      href: '/admin/billing?tab=events',
    });
  }

  const finished = data.analyses.succeeded + data.analyses.failed;
  if (
    finished > 0 &&
    data.analyses.successRate != null &&
    data.analyses.successRate < 0.9
  ) {
    items.push({
      key: 'analysis-success-rate',
      message: t('overview.attention.lowSuccessRate', {
        rate: formatSuccessRate(data.analyses.successRate),
        failed: formatLocaleNumber(data.analyses.failed),
      }),
      href: '/admin/analyses?status=failed',
    });
  }

  return items;
}

function PanelTitle({
  icon: Icon,
  tone = 'muted',
  children,
}: {
  icon: LucideIcon;
  tone?: 'muted' | 'primary' | 'up' | 'down';
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          'inline-flex size-7 items-center justify-center border',
          tone === 'primary' && 'border-primary/30 bg-primary/12 text-primary',
          tone === 'up' && 'border-market-up/30 bg-market-up-bg text-market-up',
          tone === 'down' &&
            'border-market-down/30 bg-market-down-bg text-market-down',
          tone === 'muted' && 'border-border bg-muted/50 text-muted-foreground',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      {children}
    </span>
  );
}

function MetricCell({
  icon: Icon,
  label,
  value,
  tone = 'default',
  emphasis = false,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: 'default' | 'primary' | 'up' | 'down' | 'sky';
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        'border border-border px-3 py-2.5',
        emphasis && 'shadow-[inset_2px_0_0_0_var(--primary)]',
        tone === 'primary' && 'border-primary/25 bg-primary/6',
        tone === 'up' && 'border-market-up/25 bg-market-up-bg',
        tone === 'down' && 'border-market-down/25 bg-market-down-bg',
        tone === 'sky' && 'border-sky-500/25 bg-sky-500/8',
        tone === 'default' && 'bg-muted/20',
      )}
    >
      <dt className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon
          className={cn(
            'size-3.5 shrink-0',
            tone === 'primary' && 'text-primary',
            tone === 'up' && 'text-market-up',
            tone === 'down' && 'text-market-down',
            tone === 'sky' && 'text-sky-700 dark:text-sky-300',
            tone === 'default' && 'text-muted-foreground',
          )}
          aria-hidden
        />
        {label}
      </dt>
      <dd
        className={cn(
          'mt-1 font-mono text-xl font-semibold tabular-nums tracking-tight',
          tone === 'primary' && 'text-primary',
          tone === 'up' && 'text-market-up',
          tone === 'down' && 'text-market-down',
          tone === 'sky' && 'text-sky-700 dark:text-sky-300',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function AdminOverviewPage() {
  const { t } = useTranslation('admin');
  const session = useAuthSession();
  const isAdmin = session.data?.data.user.role === 'admin';
  const overview = useQuery({
    queryKey: ['admin-overview', OVERVIEW_DAYS],
    queryFn: () => getAdminOverview(OVERVIEW_DAYS),
    enabled: isAdmin,
  });
  const data = overview.data?.data;
  const attention = data ? buildAttentionItems(data, t) : [];
  const successRateTone =
    data?.analyses.successRate == null
      ? 'default'
      : data.analyses.successRate >= 0.9
        ? 'up'
        : 'down';

  return (
    <AdminGate
      accessTitle={t('overview.accessRequired.title')}
      accessBody={t('overview.accessRequired.body')}
      loading={overview.isLoading}
    >
      <PageFrame
        title={t('overview.heading')}
        description={t('overview.subtitle', { days: OVERVIEW_DAYS })}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/users">{t('overview.links.users')}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/analyses">{t('overview.links.analyses')}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/credits">{t('overview.links.credits')}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/billing">{t('overview.links.billing')}</Link>
            </Button>
          </>
        }
      >
        {overview.isError || !data ? (
          <Alert variant="destructive">
            <AlertTitle>{t('overview.loadError.title')}</AlertTitle>
            <AlertDescription>{t('overview.loadError.body')}</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-[11px]">
                <Clock3 className="size-3" aria-hidden />
                {t('overview.periodLabel', {
                  from: formatLocaleDateTime(data.period.from),
                  to: formatLocaleDateTime(data.period.to),
                })}
              </Badge>
              {attention.length === 0 ? (
                <Badge variant="up">
                  <CheckCircle2 className="size-3" aria-hidden />
                  {t('overview.attention.clear')}
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertTriangle className="size-3" aria-hidden />
                  {t('overview.attention.count', { count: attention.length })}
                </Badge>
              )}
            </div>

            {attention.length > 0 ? (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertTitle>{t('overview.attention.title')}</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {attention.map((item) => (
                      <li key={item.key}>
                        {item.href ? (
                          <Link
                            to={item.href}
                            className="underline underline-offset-2 hover:text-foreground"
                          >
                            {item.message}
                          </Link>
                        ) : (
                          item.message
                        )}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatTile
                icon={UsersRound}
                label={t('overview.metrics.users')}
                value={formatLocaleNumber(data.userCount)}
                hint={t('overview.metrics.usersHint')}
                className="border-border/80 bg-muted/30"
                iconClassName="border-border bg-muted/60 text-muted-foreground"
              />
              <StatTile
                icon={CreditCard}
                label={t('overview.metrics.activeSubscriptions')}
                value={formatLocaleNumber(data.activeSubscriptionCount)}
                hint={t('overview.metrics.activeSubscriptionsHint')}
                className="border-sky-500/25 bg-sky-500/8"
                iconClassName="border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300"
                valueClassName="text-sky-700 dark:text-sky-300"
              />
              <StatTile
                icon={Activity}
                label={t('overview.metrics.periodAnalyses')}
                value={formatLocaleNumber(data.analyses.total)}
                hint={t('overview.metrics.successRate', {
                  rate: formatSuccessRate(data.analyses.successRate),
                })}
                className="border-primary/35 bg-primary/8 shadow-[inset_2px_0_0_0_var(--primary)]"
                iconClassName="border-primary/35 bg-primary/15 text-primary"
                valueClassName="text-primary"
              />
              <StatTile
                icon={Coins}
                label={t('overview.metrics.periodCredits')}
                value={formatLocaleNumber(data.credits.periodConsumed)}
                hint={t('overview.metrics.availableReserved', {
                  available: formatLocaleNumber(data.credits.availableTotal),
                  reserved: formatLocaleNumber(data.credits.reservedTotal),
                })}
                className="border-primary/35 bg-primary/8 shadow-[inset_2px_0_0_0_var(--primary)]"
                iconClassName="border-primary/35 bg-primary/15 text-primary"
                valueClassName="text-primary"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionPanel
                title={
                  <PanelTitle icon={Activity} tone="primary">
                    {t('overview.analyses.title')}
                  </PanelTitle>
                }
                description={t('overview.analyses.description')}
                actions={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/admin/analyses">
                      {t('overview.links.analyses')}
                    </Link>
                  </Button>
                }
              >
                <dl className="grid gap-3 sm:grid-cols-2">
                  <MetricCell
                    icon={CheckCircle2}
                    label={t('overview.analyses.succeeded')}
                    value={formatLocaleNumber(data.analyses.succeeded)}
                    tone="up"
                  />
                  <MetricCell
                    icon={XCircle}
                    label={t('overview.analyses.failed')}
                    value={formatLocaleNumber(data.analyses.failed)}
                    tone={data.analyses.failed > 0 ? 'down' : 'default'}
                  />
                  <MetricCell
                    icon={Activity}
                    label={t('overview.analyses.successRate')}
                    value={formatSuccessRate(data.analyses.successRate)}
                    tone={successRateTone}
                    emphasis
                  />
                  <MetricCell
                    icon={Timer}
                    label={t('overview.analyses.avgDuration')}
                    value={formatDurationSeconds(
                      data.timing.averageSucceededDurationSeconds,
                      t,
                    )}
                  />
                </dl>
                {data.analyses.failed > 0 ? (
                  <div className="mt-4">
                    <Button asChild variant="outline" size="sm">
                      <Link to="/admin/analyses?status=failed">
                        <XCircle className="size-3.5" aria-hidden />
                        {t('overview.analyses.viewFailed')}
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </SectionPanel>

              <SectionPanel
                title={
                  <PanelTitle icon={Wallet} tone="primary">
                    {t('overview.credits.title')}
                  </PanelTitle>
                }
                description={t('overview.credits.description')}
                actions={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/admin/credits">
                      {t('overview.links.credits')}
                    </Link>
                  </Button>
                }
              >
                <dl className="grid gap-3 sm:grid-cols-2">
                  <MetricCell
                    icon={Wallet}
                    label={t('overview.credits.available')}
                    value={formatLocaleNumber(data.credits.availableTotal)}
                    tone="sky"
                  />
                  <MetricCell
                    icon={Lock}
                    label={t('overview.credits.reserved')}
                    value={formatLocaleNumber(data.credits.reservedTotal)}
                  />
                  <MetricCell
                    icon={Coins}
                    label={t('overview.credits.periodConsumed')}
                    value={formatLocaleNumber(data.credits.periodConsumed)}
                    tone="primary"
                    emphasis
                  />
                  <MetricCell
                    icon={RotateCcw}
                    label={t('overview.credits.spentTotal')}
                    value={formatLocaleNumber(data.credits.spentTotal)}
                  />
                </dl>
              </SectionPanel>
            </div>

            <SectionPanel
              title={
                <PanelTitle icon={CircleDollarSign} tone="primary">
                  {t('overview.stripe.title')}
                </PanelTitle>
              }
              description={t('overview.stripe.description')}
              actions={
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/admin/billing">
                      {t('overview.links.billing')}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/admin/billing?tab=events">
                      {t('overview.links.stripeEvents')}
                    </Link>
                  </Button>
                </div>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={data.stripe?.configured ? 'running' : 'outline'}
                >
                  {data.stripe?.configured
                    ? t('overview.stripe.configuredYes')
                    : t('overview.stripe.configuredNo')}
                </Badge>
                <Badge
                  variant={
                    data.stripe?.connectionHealthy === true
                      ? 'up'
                      : data.stripe?.connectionHealthy === false
                        ? 'destructive'
                        : 'outline'
                  }
                >
                  {data.stripe?.connectionHealthy == null
                    ? t('overview.stripe.healthUnknown')
                    : data.stripe.connectionHealthy
                      ? t('overview.stripe.healthy')
                      : t('overview.stripe.unhealthy')}
                </Badge>
                <Badge variant="outline" className="font-mono">
                  {t('overview.stripe.modeLabel', {
                    mode: data.stripe?.mode ?? '-',
                  })}
                </Badge>
              </div>

              {data.stripe?.period ? (
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCell
                    icon={CircleDollarSign}
                    label={t('overview.stripe.revenue')}
                    value={formatLocaleCurrency(
                      data.stripe.period.revenueCents,
                      data.stripe.period.currency,
                    )}
                    tone="primary"
                    emphasis
                  />
                  <MetricCell
                    icon={RotateCcw}
                    label={t('overview.stripe.refunds')}
                    value={formatLocaleCurrency(
                      data.stripe.period.refundCents,
                      data.stripe.period.currency,
                    )}
                  />
                  <MetricCell
                    icon={XCircle}
                    label={t('overview.stripe.paymentFailures')}
                    value={formatLocaleNumber(
                      data.stripe.period.paymentFailureCount,
                    )}
                    tone={
                      data.stripe.period.paymentFailureCount > 0
                        ? 'down'
                        : 'default'
                    }
                  />
                  <MetricCell
                    icon={AlertTriangle}
                    label={t('overview.stripe.webhookFailures')}
                    value={formatLocaleNumber(
                      data.stripe.period.webhookFailedCount,
                    )}
                    tone={
                      data.stripe.period.webhookFailedCount > 0
                        ? 'down'
                        : 'default'
                    }
                  />
                </dl>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  {t('overview.stripe.noPeriod')}
                </p>
              )}
            </SectionPanel>
          </>
        )}
      </PageFrame>
    </AdminGate>
  );
}
