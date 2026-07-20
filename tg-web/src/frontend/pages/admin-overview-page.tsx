import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CreditCard,
  ShieldAlert,
  UsersRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AppShell } from '@/frontend/components/app-shell';
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
import { Skeleton } from '@/frontend/components/ui/skeleton';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { getAdminOverview } from '@/frontend/lib/auth';

export function AdminOverviewPage() {
  const { t } = useTranslation('admin');
  const session = useAuthSession();
  const overview = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => getAdminOverview(30),
    enabled: session.data?.data.user.role === 'admin',
  });
  const data = overview.data?.data;

  if (session.isLoading || overview.isLoading) {
    return (
      <AppShell title={t('overview.title')}>
        <div className="px-4 py-6 lg:px-6">
          <Skeleton className="h-72 w-full" />
        </div>
      </AppShell>
    );
  }

  if (session.isError || session.data?.data.user.role !== 'admin') {
    return (
      <AppShell title={t('overview.title')}>
        <div className="px-4 py-6 lg:px-6">
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>{t('overview.accessRequired.title')}</AlertTitle>
            <AlertDescription>
              {t('overview.accessRequired.body')}
            </AlertDescription>
          </Alert>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t('overview.title')}>
      <div className="flex flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('overview.heading')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('overview.subtitle')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/users">{t('overview.links.users')}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/analyses">{t('overview.links.analyses')}</Link>
            </Button>
          </div>
        </header>

        {overview.isError || !data ? (
          <Alert variant="destructive">
            <AlertTitle>{t('overview.loadError.title')}</AlertTitle>
            <AlertDescription>{t('overview.loadError.body')}</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={UsersRound}
                title={t('overview.metrics.users')}
                value={String(data.userCount)}
              />
              <MetricCard
                icon={CreditCard}
                title={t('overview.metrics.activeSubscriptions')}
                value={String(data.activeSubscriptionCount)}
              />
              <MetricCard
                icon={Activity}
                title={t('overview.metrics.periodAnalyses')}
                value={String(data.analyses.total)}
                hint={t('overview.metrics.successRate', {
                  rate:
                    data.analyses.successRate == null
                      ? '—'
                      : `${(data.analyses.successRate * 100).toFixed(1)}%`,
                })}
              />
              <MetricCard
                icon={CreditCard}
                title={t('overview.metrics.periodCredits')}
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
      </div>
    </AppShell>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  hint,
}: {
  icon: typeof UsersRound;
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="inline-flex items-center gap-2">
          <Icon className="size-4" />
          {title}
        </CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}
