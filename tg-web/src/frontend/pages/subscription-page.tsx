import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink, ReceiptText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import type { BillingPlan } from '@/backend/billing/contract';
import { AppShell } from '@/frontend/components/app-shell';
import { PageFrame, SectionPanel } from '@/frontend/components/page-chrome';
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
  EmptyMedia,
  EmptyTitle,
} from '@/frontend/components/ui/empty';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/frontend/components/ui/tabs';
import {
  createBillingPortal,
  createCheckout,
  getBillingOverview,
} from '@/frontend/lib/billing';
import { formatBillingStatus } from '@/frontend/lib/billing-ui';
import {
  formatLocaleCurrency,
  formatLocaleDate,
} from '@/frontend/lib/format-locale';
import {
  localizeBillingInterval,
  localizeBillingPlan,
  localizeBillingPlanName,
} from '@/frontend/lib/localize-billing-plan';

type SubscriptionTab = 'plans' | 'invoices';

function resolveSubscriptionTab(value: string | null): SubscriptionTab {
  return value === 'invoices' ? 'invoices' : 'plans';
}

/** 订阅功能：当前套餐、Checkout、Portal 管理；账单在独立页签。 */
export function SubscriptionPage() {
  const { t } = useTranslation('billing');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveSubscriptionTab(searchParams.get('tab'));
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
    mutationFn: () => createBillingPortal(),
    onSuccess: ({ data }) => window.location.assign(data.url),
    onError: () => toast.error(t('portalError')),
  });
  const data = overview.data?.data;

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
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const next = resolveSubscriptionTab(value);
              setSearchParams(
                next === 'plans' ? {} : { tab: next },
                { replace: true },
              );
            }}
            className="gap-4"
          >
            <TabsList
              variant="line"
              className="h-auto w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0"
            >
              <TabsTrigger
                value="plans"
                className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-1 data-active:border-foreground data-active:shadow-none"
              >
                {t('pages.subscription.tabs.plans')}
              </TabsTrigger>
              <TabsTrigger
                value="invoices"
                className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-1 data-active:border-foreground data-active:shadow-none"
              >
                {t('pages.subscription.tabs.invoices')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="plans" className="flex flex-col gap-5 outline-none">
              {data.subscription ? (
                <SectionPanel
                  title={t('subscription.title')}
                  description={localizeBillingPlanName(
                    data.subscription.planName,
                    t,
                    'plans.defaultPlans',
                  )}
                  actions={
                    <Badge
                      variant={
                        data.subscription.status === 'active'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {formatBillingStatus(data.subscription.status)}
                    </Badge>
                  }
                >
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">
                      {data.subscription.cancelAtPeriodEnd
                        ? t('subscription.ends')
                        : t('subscription.renews')}{' '}
                      <span className="font-mono tabular-nums">
                        {formatLocaleDate(
                          data.subscription.currentPeriodEnd,
                          t('notAvailable'),
                        )}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('subscription.cancelNote')}
                    </p>
                    <Button
                      disabled={portal.isPending}
                      onClick={() => portal.mutate()}
                      className="self-start"
                    >
                      {portal.isPending ? (
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
                    {t('plans.description')}
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.plans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      disabled={
                        Boolean(data.subscription) || checkout.isPending
                      }
                      pending={checkout.variables === plan.id}
                      onSubscribe={() => checkout.mutate(plan.id)}
                    />
                  ))}
                </div>
                {data.plans.length === 0 && (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>{t('plans.emptyTitle')}</EmptyTitle>
                      <EmptyDescription>
                        {t('plans.emptyBody')}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </section>
            </TabsContent>

            <TabsContent value="invoices" className="outline-none">
              {data.invoices.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('invoices.invoice')}</TableHead>
                      <TableHead>{t('invoices.date')}</TableHead>
                      <TableHead>{t('invoices.status')}</TableHead>
                      <TableHead className="text-right">
                        {t('invoices.paid')}
                      </TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.invoices.map((invoice) => (
                      <TableRow key={invoice.id} className="h-11">
                        <TableCell className="font-mono text-xs">
                          {invoice.number ?? invoice.id}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {formatLocaleDate(
                            invoice.createdAt,
                            t('notAvailable'),
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {formatBillingStatus(
                              invoice.status ?? t('invoices.unknown'),
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatLocaleCurrency(
                            invoice.amountPaid,
                            invoice.currency,
                          )}
                        </TableCell>
                        <TableCell>
                          {invoice.hostedInvoiceUrl && (
                            <Button asChild size="sm" variant="ghost">
                              <a
                                href={invoice.hostedInvoiceUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink data-icon="inline-start" />
                                {t('invoices.open')}
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ReceiptText />
                    </EmptyMedia>
                    <EmptyTitle>{t('invoices.emptyTitle')}</EmptyTitle>
                    <EmptyDescription>
                      {t('invoices.emptyBody')}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </TabsContent>
          </Tabs>
        ) : null}
      </PageFrame>
    </AppShell>
  );
}

function PlanCard({
  plan,
  disabled,
  pending,
  onSubscribe,
}: {
  plan: BillingPlan;
  disabled: boolean;
  pending: boolean;
  onSubscribe(): void;
}) {
  const { t } = useTranslation('billing');
  const displayPlan = localizeBillingPlan(plan, t, 'plans.defaultPlans');
  const interval = localizeBillingInterval(plan.interval, t, 'plans.intervals');
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
        <Button disabled={disabled} onClick={onSubscribe}>
          {pending && <Spinner data-icon="inline-start" />}
          {t('plans.subscribe')}
        </Button>
      </CardFooter>
    </Card>
  );
}
