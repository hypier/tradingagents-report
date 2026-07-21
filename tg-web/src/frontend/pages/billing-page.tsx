import { useMutation, useQuery } from '@tanstack/react-query';
import { Coins, ExternalLink, ReceiptText } from 'lucide-react';
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
  formatLocaleCurrency,
  formatLocaleDate,
  formatLocaleDateTimeValue,
} from '@/frontend/lib/format-locale';
import {
  createBillingPortal,
  createCheckout,
  getBillingOverview,
} from '@/frontend/lib/billing';
import {
  localizeBillingInterval,
  localizeBillingPlan,
  localizeBillingPlanName,
} from '@/frontend/lib/localize-billing-plan';

export function BillingPage() {
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
    mutationFn: () => createBillingPortal(),
    onSuccess: ({ data }) => window.location.assign(data.url),
    onError: () => toast.error(t('portalError')),
  });
  const data = overview.data?.data;

  return (
    <AppShell>
      <PageFrame title={t('heading')} description={t('subtitle')}>
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
            {data.usage && (
              <section className="flex flex-col gap-3">
                <div>
                  <h3 className="text-base font-semibold">
                    {t('usage.title')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('usage.description')}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatTile
                    label={t('usage.available')}
                    value={data.usage.availableCredits}
                  />
                  <StatTile
                    label={t('usage.reserved')}
                    value={data.usage.reservedCredits}
                  />
                  <StatTile
                    label={t('usage.consumed')}
                    value={data.usage.spentCredits}
                  />
                  <StatTile
                    label={t('usage.cycleEnds')}
                    value={formatLocaleDate(
                      data.usage.periodEnd,
                      t('notAvailable'),
                    )}
                  />
                </div>
              </section>
            )}
            {data.subscription && (
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
                    {formatStatus(data.subscription.status)}
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
                    disabled={Boolean(data.subscription) || checkout.isPending}
                    pending={checkout.variables === plan.id}
                    onSubscribe={() => checkout.mutate(plan.id)}
                  />
                ))}
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

            {data.usage && (
              <section className="flex flex-col gap-3">
                <div>
                  <h3 className="text-base font-semibold">
                    {t('ledger.title')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('ledger.description')}
                  </p>
                </div>
                {data.usage.ledger.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('ledger.date')}</TableHead>
                        <TableHead>{t('ledger.activity')}</TableHead>
                        <TableHead>{t('ledger.reference')}</TableHead>
                        <TableHead className="text-right">
                          {t('ledger.available')}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('ledger.reserved')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.usage.ledger.map((entry) => (
                        <TableRow key={entry.id} className="h-11">
                          <TableCell className="font-mono text-xs tabular-nums">
                            {formatLocaleDateTimeValue(entry.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">
                              {entry.description}
                            </div>
                            <Badge variant="outline">
                              {formatStatus(entry.entryType)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {entry.referenceId}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatDelta(entry.availableDelta)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatDelta(entry.reservedDelta)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Coins />
                      </EmptyMedia>
                      <EmptyTitle>{t('ledger.emptyTitle')}</EmptyTitle>
                      <EmptyDescription>
                        {t('ledger.emptyBody')}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </section>
            )}

            <section className="flex flex-col gap-3">
              <div>
                <h3 className="text-base font-semibold">
                  {t('invoices.title')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('invoices.description')}
                </p>
              </div>
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
                            {formatStatus(
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
            </section>
          </>
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

function formatStatus(status: string) {
  return status.replaceAll('_', ' ');
}

function formatDelta(value: number) {
  return value > 0 ? `+${value}` : String(value);
}
