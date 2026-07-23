import { useQuery } from '@tanstack/react-query';
import {
  CandlestickChart,
  Coins,
  CreditCard,
  FileText,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AppShell } from '@/frontend/components/app-shell';
import { InstrumentIdentity } from '@/frontend/components/instrument-identity';
import { InstrumentLogo } from '@/frontend/components/instrument-logo';
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
import { Skeleton } from '@/frontend/components/ui/skeleton';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import { getAccountProfile } from '@/frontend/lib/account';
import { getBillingOverview } from '@/frontend/lib/billing';
import { formatBillingStatus } from '@/frontend/lib/billing-ui';
import { formatOutputLanguage } from '@/frontend/lib/format-output-language';
import {
  formatLocaleCalendarDate,
  formatLocaleDateTime,
} from '@/frontend/lib/format-locale';
import { localizeBillingPlanName } from '@/frontend/lib/localize-billing-plan';
import { fetchPublicConfig } from '@/frontend/lib/public-config';
import {
  displayAnalysisStatus,
  listResearch,
  type AnalysisDisplayStatus,
  type AnalysisJob,
} from '@/frontend/lib/research';
import { getWatchlist } from '@/frontend/lib/watchlist';
import { formatDisplayTicker } from '@/shared/listing';

type Shortcut = {
  key: string;
  titleKey: string;
  bodyKey: string;
  href: string;
  icon: LucideIcon;
};

function statusVariant(status: AnalysisDisplayStatus) {
  if (status === 'failed') return 'destructive' as const;
  if (status === 'running' || status === 'queued' || status === 'stopping') {
    return 'running' as const;
  }
  if (status === 'succeeded') return 'up' as const;
  return 'secondary' as const;
}

function jobTicker(job: AnalysisJob) {
  return job.display?.symbol ?? formatDisplayTicker(job.ticker);
}

function jobName(job: AnalysisJob) {
  return job.display?.display_name ?? undefined;
}

/** Signed-in landing: shortcuts, credits, and recent jobs. */
export function WelcomePage() {
  const { t } = useTranslation('welcome');
  const { t: tCommon } = useTranslation('common');
  const { t: tBilling } = useTranslation('billing');
  const { t: tAccount } = useTranslation('account');
  const session = useAuthSession();
  const publicConfig = useQuery({
    queryKey: ['public-config'],
    queryFn: () => fetchPublicConfig(),
  });
  const showWatchlist =
    publicConfig.isLoading || publicConfig.data?.features.watchlist !== false;

  const profile = useQuery({
    queryKey: ['account-profile'],
    queryFn: getAccountProfile,
  });
  const billing = useQuery({
    queryKey: ['billing-overview'],
    queryFn: () => getBillingOverview(),
  });
  const recentJobs = useQuery({
    queryKey: ['analyses', 'welcome-recent'],
    queryFn: () => listResearch({ limit: 6 }),
    refetchInterval: (query) => {
      const jobs = query.state.data?.data ?? [];
      return jobs.some(
        (job) => job.status === 'queued' || job.status === 'running',
      )
        ? 5_000
        : false;
    },
  });
  const watchlist = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => getWatchlist(),
    enabled: showWatchlist && !publicConfig.isLoading,
  });

  const displayName =
    profile.data?.data.profile.displayName?.trim() ||
    session.data?.data.user.displayName?.trim() ||
    '';
  const title = displayName
    ? t('titleNamed', { name: displayName })
    : t('title');

  const usage = billing.data?.data.usage;
  const subscription = billing.data?.data.subscription;
  const billingConfigured = billing.data?.data.configured;
  const jobs = recentJobs.data?.data ?? [];
  const activeJobCount = jobs.filter(
    (job) => job.status === 'queued' || job.status === 'running',
  ).length;
  const prefs = profile.data?.data.profile;

  const shortcuts: Shortcut[] = [
    {
      key: 'desk',
      titleKey: 'shortcuts.desk.title',
      bodyKey: 'shortcuts.desk.body',
      href: '/desk',
      icon: LayoutDashboard,
    },
    {
      key: 'tasks',
      titleKey: 'shortcuts.tasks.title',
      bodyKey: 'shortcuts.tasks.body',
      href: '/tasks',
      icon: ListTodo,
    },
    {
      key: 'reports',
      titleKey: 'shortcuts.reports.title',
      bodyKey: 'shortcuts.reports.body',
      href: '/reports',
      icon: FileText,
    },
    {
      key: 'quotes',
      titleKey: 'shortcuts.quotes.title',
      bodyKey: 'shortcuts.quotes.body',
      href: '/quotes',
      icon: CandlestickChart,
    },
    ...(showWatchlist
      ? [
          {
            key: 'watchlist',
            titleKey: 'shortcuts.watchlist.title',
            bodyKey: 'shortcuts.watchlist.body',
            href: '/watchlist',
            icon: ListChecks,
          } satisfies Shortcut,
        ]
      : []),
    {
      key: 'subscription',
      titleKey: 'shortcuts.subscription.title',
      bodyKey: 'shortcuts.subscription.body',
      href: '/billing/subscription',
      icon: CreditCard,
    },
    {
      key: 'usage',
      titleKey: 'shortcuts.usage.title',
      bodyKey: 'shortcuts.usage.body',
      href: '/billing/usage',
      icon: Coins,
    },
    {
      key: 'account',
      titleKey: 'shortcuts.account.title',
      bodyKey: 'shortcuts.account.body',
      href: '/account',
      icon: UserRound,
    },
  ];

  const loadFailed =
    billing.isError || recentJobs.isError || profile.isError;

  return (
    <AppShell>
      <PageFrame
        title={title}
        description={t('subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link to="/tasks">{t('viewTasks')}</Link>
            </Button>
            <Button asChild>
              <Link to="/desk">{t('runAnalysis')}</Link>
            </Button>
          </div>
        }
      >
        {loadFailed ? (
          <Alert variant="destructive">
            <AlertTitle>{t('loadError.title')}</AlertTitle>
            <AlertDescription>{t('loadError.body')}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {billing.isLoading ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : (
            <>
              <StatTile
                label={t('stats.credits')}
                value={
                  billingConfigured && usage
                    ? usage.availableCredits
                    : t('stats.creditsUnavailable')
                }
                hint={t('stats.creditsHint')}
                icon={Coins}
                className="border-border/80 bg-muted/40"
              />
              <StatTile
                label={t('stats.plan')}
                value={
                  subscription
                    ? localizeBillingPlanName(
                        subscription.planName,
                        tBilling,
                        'plans.defaultPlans',
                      )
                    : t('stats.planNone')
                }
                hint={
                  subscription
                    ? formatBillingStatus(subscription.status)
                    : t('stats.planHint')
                }
                icon={CreditCard}
                valueClassName="truncate text-xl"
              />
            </>
          )}
          {recentJobs.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <StatTile
              label={t('stats.activeJobs')}
              value={activeJobCount}
              hint={t('stats.activeJobsHint')}
              icon={ListTodo}
              className={
                activeJobCount > 0
                  ? 'border-primary/25 bg-primary/6'
                  : undefined
              }
            />
          )}
          {showWatchlist ? (
            watchlist.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <StatTile
                label={t('stats.watchlist')}
                value={watchlist.data?.data.items.length ?? 0}
                hint={t('stats.watchlistHint')}
                icon={ListChecks}
              />
            )
          ) : null}
        </section>

        <SectionPanel
          title={t('shortcuts.title')}
          description={t('shortcuts.description')}
          bodyClassName="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        >
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                to={item.href}
                className="group flex min-h-24 flex-col gap-2 border border-border bg-muted/20 px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-primary/6"
              >
                <span className="inline-flex size-7 items-center justify-center border border-border bg-background text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium tracking-tight text-foreground">
                    {t(item.titleKey)}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t(item.bodyKey)}
                  </span>
                </span>
              </Link>
            );
          })}
        </SectionPanel>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
          <SectionPanel
            title={t('recent.title')}
            description={t('recent.description')}
            actions={
              <Button asChild variant="outline" size="sm">
                <Link to="/tasks">{t('recent.viewAll')}</Link>
              </Button>
            }
            bodyClassName="p-0"
          >
            {recentJobs.isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : jobs.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                {t('recent.empty')}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {jobs.map((job) => {
                  const status = displayAnalysisStatus(job) ?? job.status;
                  const href =
                    job.status === 'succeeded'
                      ? `/reports/${job.id}`
                      : '/tasks';
                  return (
                    <li key={job.id}>
                      <Link
                        to={href}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                      >
                        <InstrumentLogo
                          symbol={jobTicker(job)}
                          logoUrl={job.display?.logo_url}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <InstrumentIdentity
                            name={jobName(job)}
                            ticker={jobTicker(job)}
                            density="compact"
                          />
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {job.trade_date
                              ? t('recent.tradeDate', {
                                  date: formatLocaleCalendarDate(
                                    job.trade_date,
                                  ),
                                })
                              : null}
                            {job.updated_at || job.created_at
                              ? `${job.trade_date ? ' · ' : ''}${formatLocaleDateTime(
                                  job.updated_at ?? job.created_at,
                                )}`
                              : null}
                          </p>
                        </div>
                        <Badge
                          variant={statusVariant(status)}
                          className="shrink-0"
                        >
                          {tCommon(`status.${status}`)}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionPanel>

          <SectionPanel
            title={t('prefs.title')}
            description={t('prefs.description')}
            actions={
              <Button asChild variant="outline" size="sm">
                <Link to="/account">{t('prefs.edit')}</Link>
              </Button>
            }
          >
            {profile.isLoading || !prefs ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <dl className="space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
                  <dt className="text-muted-foreground">{t('prefs.market')}</dt>
                  <dd className="font-medium tabular-nums">
                    {(() => {
                      const key =
                        `preferences.markets.${prefs.defaultMarket}` as const;
                      const localized = tAccount(key);
                      return localized === key
                        ? prefs.defaultMarket
                        : localized;
                    })()}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
                  <dt className="text-muted-foreground">
                    {t('prefs.timezone')}
                  </dt>
                  <dd className="font-mono text-xs tabular-nums">
                    {prefs.timezone}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {t('prefs.reportLanguage')}
                  </dt>
                  <dd className="font-medium">
                    {formatOutputLanguage(prefs.reportLanguage, tCommon)}
                  </dd>
                </div>
              </dl>
            )}
          </SectionPanel>
        </div>
      </PageFrame>
    </AppShell>
  );
}
