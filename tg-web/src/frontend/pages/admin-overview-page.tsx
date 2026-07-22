import { useQuery } from '@tanstack/react-query';
import { Activity, CreditCard, UsersRound } from 'lucide-react';
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
import { getAdminOverview } from '@/frontend/lib/auth';
import { formatLocaleCurrency } from '@/frontend/lib/format-locale';

export function AdminOverviewPage() {
  const { t } = useTranslation('admin');
  const session = useAuthSession();
  const isAdmin = session.data?.data.user.role === 'admin';
  const overview = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => getAdminOverview(30),
    enabled: isAdmin,
  });
  const data = overview.data?.data;

  return (
    <AdminGate
      accessTitle={t('overview.accessRequired.title')}
      accessBody={t('overview.accessRequired.body')}
      loading={overview.isLoading}
    >
      <PageFrame
        title={t('overview.heading')}
        description={t('overview.subtitle')}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/users">{t('overview.links.users')}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/analyses">{t('overview.links.analyses')}</Link>
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatTile
                icon={UsersRound}
                label={t('overview.metrics.users')}
                value={String(data.userCount)}
              />
              <StatTile
                icon={CreditCard}
                label={t('overview.metrics.activeSubscriptions')}
                value={String(data.activeSubscriptionCount)}
              />
              <StatTile
                icon={Activity}
                label={t('overview.metrics.periodAnalyses')}
                value={String(data.analyses.total)}
                hint={t('overview.metrics.successRate', {
                  rate:
                    data.analyses.successRate == null
                      ? '—'
                      : `${(data.analyses.successRate * 100).toFixed(1)}%`,
                })}
              />
              <StatTile
                icon={CreditCard}
                label={t('overview.metrics.periodCredits')}
                value={String(data.credits.periodConsumed)}
                hint={t('overview.metrics.availableReserved', {
                  available: data.credits.availableTotal,
                  reserved: data.credits.reservedTotal,
                })}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <SectionPanel
                title={t('overview.queue.title')}
                description={t('overview.queue.description')}
              >
                <div className="flex flex-wrap gap-3">
                  <Badge variant="outline">
                    {t('overview.queue.queued', { count: data.queue.queued })}
                  </Badge>
                  <Badge variant="info">
                    {t('overview.queue.running', { count: data.queue.running })}
                  </Badge>
                  <Badge variant="secondary">
                    {t('overview.queue.failed', {
                      count: data.analyses.failed,
                    })}
                  </Badge>
                  <p className="w-full text-sm text-muted-foreground">
                    {t('overview.queue.avgDuration', {
                      seconds:
                        data.timing.averageSucceededDurationSeconds ?? '—',
                    })}
                  </p>
                </div>
              </SectionPanel>

              <SectionPanel
                title={t('overview.stripe.title')}
                description={t('overview.stripe.description')}
              >
                <div className="space-y-3 text-sm">
                  <div className="space-y-2">
                    <p>
                      {t('overview.stripe.configured')}:{' '}
                      {data.stripe?.configured
                        ? t('overview.stripe.yes')
                        : t('overview.stripe.no')}
                    </p>
                    <p>
                      {t('overview.stripe.health')}:{' '}
                      {data.stripe?.connectionHealthy == null
                        ? '—'
                        : data.stripe.connectionHealthy
                          ? t('overview.stripe.healthy')
                          : t('overview.stripe.unhealthy')}
                    </p>
                    <p>
                      {t('overview.stripe.mode')}: {data.stripe?.mode ?? '—'}
                    </p>
                  </div>
                  {data.stripe?.period ? (
                    <dl className="grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">
                          {t('overview.stripe.revenue')}
                        </dt>
                        <dd className="font-medium tabular-nums">
                          {formatLocaleCurrency(
                            data.stripe.period.revenueCents,
                            data.stripe.period.currency,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          {t('overview.stripe.refunds')}
                        </dt>
                        <dd className="font-medium tabular-nums">
                          {formatLocaleCurrency(
                            data.stripe.period.refundCents,
                            data.stripe.period.currency,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          {t('overview.stripe.paymentFailures')}
                        </dt>
                        <dd className="font-medium tabular-nums">
                          {data.stripe.period.paymentFailureCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          {t('overview.stripe.webhookFailures')}
                        </dt>
                        <dd className="font-medium tabular-nums">
                          {data.stripe.period.webhookFailedCount}
                        </dd>
                      </div>
                    </dl>
                  ) : null}
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
                </div>
              </SectionPanel>
            </div>
          </>
        )}
      </PageFrame>
    </AdminGate>
  );
}
