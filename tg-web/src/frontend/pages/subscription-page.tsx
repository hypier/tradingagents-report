import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { BillingPlan } from '@/backend/billing/contract';
import { AppShell } from '@/frontend/components/app-shell';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/frontend/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/frontend/components/ui/empty';
import { Skeleton } from '@/frontend/components/ui/skeleton';
import { Spinner } from '@/frontend/components/ui/spinner';
import {
  createBillingPortal,
  createCheckout,
  getBillingOverview,
} from '@/frontend/lib/billing';
import {
  formatBillingStatus,
  resolvePlanCardAction,
  type PlanCardAction,
} from '@/frontend/lib/billing-ui';
import {
  formatLocaleCurrency,
  formatLocaleDate,
} from '@/frontend/lib/format-locale';
import {
  localizeBillingInterval,
  localizeBillingPlan,
  localizeBillingPlanName,
} from '@/frontend/lib/localize-billing-plan';

/** 订阅：当前套餐、Checkout、Portal 管理（含升级/降级深链）。 */
export function SubscriptionPage() {
  const { t } = useTranslation('billing');
  const overview = useQuery({
    queryKey: ['billing-overview'],
    queryFn: () => getBillingOverview(),
  });
  const checkout = useMutation({
    mutationFn: (priceId: string) => createCheckout(priceId),
    onSuccess: ({ data }) => window.location.assign(data.url),
    onError: () => toast.error(t('checkoutError')),
  });
  const portal = useMutation({
    mutationFn: (priceId?: string) =>
      createBillingPortal(priceId ? { priceId } : undefined),
    onSuccess: ({ data }) => window.location.assign(data.url),
    onError: () => toast.error(t('portalError')),
  });
  const data = overview.data?.data;
  const busy =
    checkout.isPending || portal.isPending;

  return (
    <AppShell>
      <PageFrame
        title={t('pages.subscription.heading')}
        description={t('pages.subscription.subtitle')}
      >
        {overview.isError && (
          <Alert variant="destructive">
            <AlertTitle>{t('loadError.title')}</AlertTitle>
            <AlertDescription>{t('loadError.body')}</AlertDescription>
          </Alert>
        )}

        {overview.isLoading ? (
          <Skeleton className="h-44 w-full" />
        ) : data && !data.configured ? (
          <Alert>
            <AlertTitle>{t('notConfigured.title')}</AlertTitle>
            <AlertDescription>{t('notConfigured.body')}</AlertDescription>
          </Alert>
        ) : data ? (
          <>
            {data.subscription ? (
              <SectionPanel
                title={t('subscription.title')}
                actions={
                  <Badge
                    variant={
                      data.subscription.cancelAtPeriodEnd ||
                      data.subscription.status !== 'active'
                        ? 'secondary'
                        : 'default'
                    }
                  >
                    {data.subscription.cancelAtPeriodEnd
                      ? t('subscription.statusCanceled')
                      : formatBillingStatus(data.subscription.status)}
                  </Badge>
                }
              >
                <div className="flex flex-col gap-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatTile
                      label={t('subscription.plan')}
                      value={
                        <span className="text-amber-700 dark:text-amber-400">
                          {localizeBillingPlanName(
                            data.subscription.planName,
                            t,
                            'plans.defaultPlans',
                          )}
                        </span>
                      }
                      valueClassName="font-sans"
                      className="border-amber-500/30 bg-amber-500/8"
                    />
                    <StatTile
                      label={
                        data.subscription.cancelAtPeriodEnd
                          ? t('subscription.ends')
                          : t('subscription.renews')
                      }
                      value={
                        <span
                          className={
                            data.subscription.cancelAtPeriodEnd
                              ? 'text-rose-700 dark:text-rose-300'
                              : 'text-sky-700 dark:text-sky-300'
                          }
                        >
                          {formatLocaleDate(
                            data.subscription.currentPeriodEnd,
                            t('notAvailable'),
                          )}
                        </span>
                      }
                      className={
                        data.subscription.cancelAtPeriodEnd
                          ? 'border-rose-500/25 bg-rose-500/8'
                          : 'border-sky-500/25 bg-sky-500/8'
                      }
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {data.subscription.cancelAtPeriodEnd
                      ? t('subscription.canceledNote')
                      : t('subscription.cancelNote')}
                  </p>
                  <Button
                    disabled={busy}
                    onClick={() => portal.mutate(undefined)}
                    className="self-start"
                  >
                    {portal.isPending && portal.variables === undefined ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <ExternalLink data-icon="inline-start" />
                    )}
                    {t('subscription.manage')}
                  </Button>
                </div>
              </SectionPanel>
            ) : (
              <Alert>
                <AlertTitle>{t('subscription.noSubTitle')}</AlertTitle>
                <AlertDescription>
                  {t('subscription.noSubBody')}
                </AlertDescription>
              </Alert>
            )}

            <section className="flex flex-col gap-3">
              <div>
                <h3 className="text-base font-semibold">{t('plans.title')}</h3>
                <p className="text-sm text-muted-foreground">
                  {data.subscription
                    ? t('plans.descriptionWithSubscription')
                    : t('plans.description')}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.plans.map((plan) => {
                  const action = resolvePlanCardAction(
                    plan,
                    data.subscription,
                    data.plans,
                  );
                  const pending =
                    (action === 'subscribe' &&
                      checkout.isPending &&
                      checkout.variables === plan.id) ||
                    ((action === 'upgrade' || action === 'downgrade') &&
                      portal.isPending &&
                      portal.variables === plan.id);
                  return (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      action={action}
                      pending={pending}
                      disabled={busy && !pending}
                      onAction={() => {
                        if (action === 'subscribe') {
                          checkout.mutate(plan.id);
                          return;
                        }
                        if (action === 'upgrade' || action === 'downgrade') {
                          portal.mutate(plan.id);
                        }
                      }}
                    />
                  );
                })}
              </div>
              {data.plans.length === 0 && (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>{t('plans.emptyTitle')}</EmptyTitle>
                    <EmptyDescription>{t('plans.emptyBody')}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </section>
          </>
        ) : null}
      </PageFrame>
    </AppShell>
  );
}

function PlanCard({
  plan,
  action,
  disabled,
  pending,
  onAction,
}: {
  plan: BillingPlan;
  action: PlanCardAction;
  disabled: boolean;
  pending: boolean;
  onAction(): void;
}) {
  const { t } = useTranslation('billing');
  const displayPlan = localizeBillingPlan(plan, t, 'plans.defaultPlans');
  const interval = localizeBillingInterval(plan.interval, t, 'plans.intervals');
  const isCurrent = action === 'current';
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h4>{displayPlan.name}</h4>
        </CardTitle>
        <CardDescription>
          {displayPlan.description ?? t('plans.fallbackDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-2xl font-semibold tabular-nums">
          {formatLocaleCurrency(plan.unitAmount, plan.currency)}
        </p>
        <p className="text-sm text-muted-foreground">
          {plan.intervalCount > 1
            ? t('plans.perCount', {
                count: plan.intervalCount,
                interval,
              })
            : t('plans.per', { interval })}
        </p>
        <p className="mt-4 text-sm font-medium tabular-nums">
          {t('plans.analysesPerCycle', { count: plan.analysisCredits })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(plan.supportedMarkets ?? []).map((market) => (
            <Badge key={market} variant="secondary">
              {market}
            </Badge>
          ))}
        </div>
        <ul className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
          {displayPlan.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          disabled={disabled || isCurrent}
          variant={
            action === 'upgrade'
              ? 'default'
              : action === 'downgrade'
                ? 'outline'
                : isCurrent
                  ? 'secondary'
                  : 'default'
          }
          onClick={onAction}
        >
          {pending && <Spinner data-icon="inline-start" />}
          {!pending && (action === 'upgrade' || action === 'downgrade') && (
            <ExternalLink data-icon="inline-start" />
          )}
          {t(`plans.actions.${action}`)}
        </Button>
      </CardFooter>
    </Card>
  );
}
