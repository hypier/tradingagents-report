import { useQuery } from '@tanstack/react-query';
import { Activity, CreditCard, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AdminGate } from '@/frontend/components/admin-gate';
import { PageFrame, StatTile } from '@/frontend/components/page-chrome';
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
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { getAdminOverview } from '@/frontend/lib/auth';

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

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>{t('overview.queue.title')}</CardTitle>
                  <CardDescription>
                    {t('overview.queue.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('overview.stripe.title')}</CardTitle>
                  <CardDescription>
                    {t('overview.stripe.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
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
                  <Button asChild variant="outline" size="sm">
                    <Link to="/admin/billing">
                      {t('overview.links.billing')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </PageFrame>
    </AdminGate>
  );
}
