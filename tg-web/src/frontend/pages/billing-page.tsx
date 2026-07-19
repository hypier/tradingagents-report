import { useMutation, useQuery } from '@tanstack/react-query';
import { Coins, ExternalLink, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';

import type { BillingPlan } from '@/backend/billing/contract';
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
  CardAction,
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
  createBillingPortal,
  createCheckout,
  getBillingOverview,
} from '@/frontend/lib/billing';

export function BillingPage() {
  const overview = useQuery({
    queryKey: ['billing-overview'],
    queryFn: () => getBillingOverview(),
  });
  const checkout = useMutation({
    mutationFn: (priceId: string) => createCheckout(priceId),
    onSuccess: ({ data }) => window.location.assign(data.url),
    onError: () => toast.error('Unable to start Stripe Checkout.'),
  });
  const portal = useMutation({
    mutationFn: () => createBillingPortal(),
    onSuccess: ({ data }) => window.location.assign(data.url),
    onError: () => toast.error('Unable to open the billing portal.'),
  });
  const data = overview.data?.data;

  return (
    <AppShell title="Subscription">
      <main className="flex flex-1 flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
        <header className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Subscription and billing</h2>
          <p className="text-sm text-muted-foreground">
            Plans, renewal status, and invoices
          </p>
        </header>

        {overview.isError && (
          <Alert variant="destructive">
            <AlertTitle>Unable to load billing</AlertTitle>
            <AlertDescription>
              Stripe billing data is currently unavailable.
            </AlertDescription>
          </Alert>
        )}

        {overview.isLoading ? (
          <Skeleton className="h-44 w-full" />
        ) : data && !data.configured ? (
          <Alert>
            <AlertTitle>Subscriptions are not available</AlertTitle>
            <AlertDescription>
              Stripe is not connected for this environment.
            </AlertDescription>
          </Alert>
        ) : data ? (
          <>
            {data.usage && (
              <section className="flex flex-col gap-3">
                <div>
                  <h3 className="text-base font-semibold">Usage</h3>
                  <p className="text-sm text-muted-foreground">
                    One completed analysis consumes one credit
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <UsageCard
                    label="Available"
                    value={data.usage.availableCredits}
                  />
                  <UsageCard
                    label="Reserved"
                    value={data.usage.reservedCredits}
                  />
                  <UsageCard label="Consumed" value={data.usage.spentCredits} />
                  <Card>
                    <CardHeader>
                      <CardDescription>Cycle ends</CardDescription>
                      <CardTitle>{formatDate(data.usage.periodEnd)}</CardTitle>
                    </CardHeader>
                  </Card>
                </div>
              </section>
            )}
            {data.subscription && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h3>Current subscription</h3>
                  </CardTitle>
                  <CardDescription>
                    {data.subscription.planName}
                  </CardDescription>
                  <CardAction>
                    <Badge
                      variant={
                        data.subscription.status === 'active'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {formatStatus(data.subscription.status)}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-1">
                  <p className="text-sm text-muted-foreground">
                    {data.subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'}{' '}
                    {formatDate(data.subscription.currentPeriodEnd)}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button
                    disabled={portal.isPending}
                    onClick={() => portal.mutate()}
                  >
                    {portal.isPending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <ExternalLink data-icon="inline-start" />
                    )}
                    Manage subscription
                  </Button>
                </CardFooter>
              </Card>
            )}

            <section className="flex flex-col gap-3">
              <div>
                <h3 className="text-base font-semibold">Available plans</h3>
                <p className="text-sm text-muted-foreground">
                  Recurring Stripe plans
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
                    <EmptyTitle>No subscription plans</EmptyTitle>
                    <EmptyDescription>
                      No active recurring prices are available.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </section>

            {data.usage && (
              <section className="flex flex-col gap-3">
                <div>
                  <h3 className="text-base font-semibold">Credit activity</h3>
                  <p className="text-sm text-muted-foreground">
                    Grants, reservations, consumption, and releases
                  </p>
                </div>
                {data.usage.ledger.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Activity</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">Reserved</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.usage.ledger.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            {new Intl.DateTimeFormat(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }).format(new Date(entry.createdAt))}
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
                      <EmptyTitle>No credit activity</EmptyTitle>
                      <EmptyDescription>
                        Cycle grants and analysis usage will appear here.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </section>
            )}

            <section className="flex flex-col gap-3">
              <div>
                <h3 className="text-base font-semibold">Invoices</h3>
                <p className="text-sm text-muted-foreground">
                  Latest Stripe billing documents
                </p>
              </div>
              {data.invoices.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell>{invoice.number ?? invoice.id}</TableCell>
                        <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {formatStatus(invoice.status ?? 'unknown')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(invoice.amountPaid, invoice.currency)}
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
                                Open
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
                    <EmptyTitle>No invoices</EmptyTitle>
                    <EmptyDescription>
                      Stripe invoices will appear here.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </section>
          </>
        ) : null}
      </main>
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h4>{plan.name}</h4>
        </CardTitle>
        <CardDescription>{plan.description ?? 'Subscription'}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">
          {formatMoney(plan.unitAmount, plan.currency)}
        </p>
        <p className="text-sm text-muted-foreground">
          per {plan.intervalCount > 1 ? `${plan.intervalCount} ` : ''}
          {plan.interval}
        </p>
        <p className="mt-4 text-sm font-medium tabular-nums">
          {plan.analysisCredits} analyses per cycle
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(plan.supportedMarkets ?? []).map((market) => (
            <Badge key={market} variant="secondary">
              {market}
            </Badge>
          ))}
        </div>
        <ul className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
          {(plan.features ?? []).map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button disabled={disabled} onClick={onSubscribe}>
          {pending && <Spinner data-icon="inline-start" />}
          Subscribe
        </Button>
      </CardFooter>
    </Card>
  );
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function formatDate(timestamp: number | null) {
  return timestamp
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
        new Date(timestamp * 1000),
      )
    : 'Not available';
}

function formatStatus(status: string) {
  return status.replaceAll('_', ' ');
}

function formatDelta(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function UsageCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
