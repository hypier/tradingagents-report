import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  Coins,
  CreditCard,
  FileCheck2,
  FileText,
  ListChecks,
  ListTodo,
  Play,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { AppShell } from '@/frontend/components/app-shell';
import { RecentReports } from '@/frontend/components/dashboard/recent-reports';
import { BrandMark } from '@/frontend/components/icons/research-icons';
import {
  PageFrame,
  SectionPanel,
  StatTile,
} from '@/frontend/components/page-chrome';
import { Button } from '@/frontend/components/ui/button';
import { useJobMarketIdentities } from '@/frontend/hooks/use-market-identities';
import { getBillingOverview } from '@/frontend/lib/billing';
import {
  formatLocaleDate,
  formatLocaleNumber,
} from '@/frontend/lib/format-locale';
import { localizeBillingPlanName } from '@/frontend/lib/localize-billing-plan';
import { listResearch } from '@/frontend/lib/research';
import { formatDisplayTicker } from '@/shared/listing';

const DASHBOARD_JOB_LIMIT = 20;
const RECENT_REPORT_LIMIT = 5;

const quickLinks = [
  { key: 'reports', href: '/reports', icon: FileText },
  { key: 'tasks', href: '/tasks', icon: ListTodo },
  { key: 'watchlist', href: '/watchlist', icon: ListChecks },
] as const;

export function DashboardPage() {
  const { t } = useTranslation('dashboard');
  const { t: billingT } = useTranslation('billing');
  const navigate = useNavigate();
  const jobs = useQuery({
    queryKey: ['analyses', 'dashboard', DASHBOARD_JOB_LIMIT],
    queryFn: () => listResearch({ limit: DASHBOARD_JOB_LIMIT }),
    refetchInterval: (query) =>
      query.state.data?.data.some(
        (job) => job.status === 'queued' || job.status === 'running',
      )
        ? 5_000
        : false,
  });
  const billing = useQuery({
    queryKey: ['billing-overview'],
    queryFn: () => getBillingOverview(),
    staleTime: 30_000,
  });
  const recentJobs = jobs.data?.data ?? [];
  const visibleJobs = recentJobs.slice(0, RECENT_REPORT_LIMIT);
  const { identities } = useJobMarketIdentities(visibleJobs);
  const activeJobs = recentJobs.filter(
    (job) => job.status === 'queued' || job.status === 'running',
  ).length;
  const latestReport = recentJobs.find((job) => job.status === 'succeeded');
  const latestReportTicker = latestReport
    ? (latestReport.display?.symbol ?? formatDisplayTicker(latestReport.ticker))
    : t('metrics.none');
  const overview = billing.data?.data;
  const availableCredits = overview?.usage?.availableCredits;
  const subscription = overview?.subscription ?? null;
  const needsSubscribe =
    billing.isSuccess && Boolean(overview?.configured) && !subscription;
  const planName = subscription
    ? localizeBillingPlanName(
        subscription.planName,
        billingT,
        'plans.defaultPlans',
      )
    : null;
  const planHint = !billing.isSuccess
    ? t('metrics.plan.hintLoading')
    : subscription
      ? subscription.cancelAtPeriodEnd
        ? t('metrics.plan.hintEnds', {
            date: formatLocaleDate(
              subscription.currentPeriodEnd,
              t('metrics.none'),
            ),
          })
        : t('metrics.plan.hintRenews', {
            date: formatLocaleDate(
              subscription.currentPeriodEnd,
              t('metrics.none'),
            ),
          })
      : t('metrics.plan.hintNone');

  return (
    <AppShell>
      <PageFrame title={t('title')} description={t('subtitle')} bodyClassName="gap-5">
        <section aria-labelledby="dashboard-metrics-title">
          <h2 id="dashboard-metrics-title" className="sr-only">
            {t('metrics.title')}
          </h2>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile
              icon={Activity}
              label={t('metrics.active.label')}
              value={jobs.isLoading ? '—' : formatLocaleNumber(activeJobs)}
              hint={t('metrics.active.hint')}
              className="border-primary/20 bg-primary/[0.06]"
              iconClassName="border-primary/25 bg-primary/10 text-primary"
            />
            <StatTile
              icon={FileCheck2}
              label={t('metrics.latest.label')}
              value={jobs.isLoading ? '—' : latestReportTicker}
              hint={t('metrics.latest.hint')}
              className="border-market-up/20 bg-market-up-bg/70"
              iconClassName="border-market-up/25 bg-market-up-bg text-market-up"
              valueClassName="truncate"
            />
            <StatTile
              icon={Coins}
              label={t('metrics.credits.label')}
              value={
                billing.isLoading || availableCredits === undefined
                  ? '—'
                  : formatLocaleNumber(availableCredits)
              }
              hint={t('metrics.credits.hint')}
              className="border-sky-500/20 bg-sky-500/[0.07]"
              iconClassName="border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300"
            />
            <StatTile
              icon={CreditCard}
              label={t('metrics.plan.label')}
              value={
                billing.isLoading
                  ? '—'
                  : (planName ?? t('metrics.plan.none'))
              }
              hint={planHint}
              className={
                needsSubscribe
                  ? 'border-amber-500/25 bg-amber-500/[0.08]'
                  : 'border-amber-500/20 bg-amber-500/[0.06]'
              }
              iconClassName="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              valueClassName="truncate font-sans text-xl"
            />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <section className="relative flex min-h-48 overflow-hidden border border-primary/25 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_12%,var(--background)),var(--background)_55%,color-mix(in_oklab,var(--primary)_6%,var(--card)))] shadow-[inset_3px_0_0_0_var(--primary)]">
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-6 px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center border border-primary/25 bg-primary/10 text-primary">
                  <BrandMark className="size-8" />
                </span>
                <div className="min-w-0">
                  <p className="font-label-caps text-primary">
                    {needsSubscribe
                      ? t('start.subscribeEyebrow')
                      : t('start.eyebrow')}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                    {needsSubscribe
                      ? t('start.subscribeTitle')
                      : t('start.title')}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {needsSubscribe
                      ? t('start.subscribeDescription')
                      : t('start.description')}
                  </p>
                </div>
              </div>
              <div>
                <Button asChild size="lg">
                  {needsSubscribe ? (
                    <Link to="/billing/subscription">
                      <CreditCard data-icon="inline-start" />
                      {t('actions.subscribe')}
                    </Link>
                  ) : (
                    <Link to="/desk">
                      <Play data-icon="inline-start" />
                      {t('actions.start')}
                    </Link>
                  )}
                </Button>
              </div>
            </div>
          </section>

          <SectionPanel
            title={t('quick.title')}
            description={t('quick.description')}
            className="border-border/80 bg-background"
            bodyClassName="p-0"
          >
            <nav aria-label={t('quick.title')}>
              <ul className="divide-y divide-border">
                {quickLinks.map(({ key, href, icon: Icon }) => (
                  <li key={key}>
                    <Link
                      to={href}
                      className="group flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center border border-border bg-muted/25 text-muted-foreground group-hover:border-primary/25 group-hover:bg-primary/10 group-hover:text-primary">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {t(`quick.${key}.title`)}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {t(`quick.${key}.description`)}
                        </span>
                      </span>
                      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </SectionPanel>
        </div>

        <section className="min-w-0 overflow-hidden border border-border bg-background">
          <RecentReports
            jobs={visibleJobs}
            loading={jobs.isLoading}
            error={jobs.isError}
            identities={identities}
            onOpenReport={(id) => navigate(`/reports/${id}`)}
          />
          <div className="flex justify-end border-t border-border px-4 py-2.5">
            <Button asChild variant="ghost" size="sm">
              <Link to="/reports">
                {t('actions.viewReports')}
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </section>
      </PageFrame>
    </AppShell>
  );
}
