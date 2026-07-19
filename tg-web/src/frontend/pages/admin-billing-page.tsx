import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  CheckCircle2,
  CircleDollarSign,
  Clipboard,
  CreditCard,
  Save,
  ShieldAlert,
  Trash2,
  Webhook,
} from 'lucide-react';
import { toast } from 'sonner';

import type {
  BillingInterval,
  BillingPlan,
  CreateBillingPlanInput,
} from '@/backend/billing/contract';
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
import { Field, FieldGroup, FieldLabel } from '@/frontend/components/ui/field';
import { Input } from '@/frontend/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
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
  ToggleGroup,
  ToggleGroupItem,
} from '@/frontend/components/ui/toggle-group';
import { useAuthSession } from '@/frontend/hooks/use-auth-session';
import {
  archiveBillingPlan,
  clearStripeConfiguration,
  createBillingPlan,
  getBillingSettings,
  updateStripeConfiguration,
} from '@/frontend/lib/billing';

type PlanForm = {
  name: string;
  description: string;
  price: string;
  currency: CreateBillingPlanInput['currency'];
  interval: BillingInterval;
  analysisCredits: string;
  supportedMarkets: string[];
  features: string;
};

const initialPlan: PlanForm = {
  name: '',
  description: '',
  price: '',
  currency: 'usd',
  interval: 'month',
  analysisCredits: '20',
  supportedMarkets: ['US'],
  features: 'Full analyst team, PDF reports',
};

export function AdminBillingPage() {
  const [plan, setPlan] = useState(initialPlan);
  const [stripeConfiguration, setStripeConfiguration] = useState({
    secretKey: '',
    webhookSecret: '',
  });
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const isAdmin = session.data?.data.user.role === 'admin';
  const settings = useQuery({
    queryKey: ['admin-billing-settings'],
    queryFn: () => getBillingSettings(),
    enabled: isAdmin,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ['admin-billing-settings'],
    });
    void queryClient.invalidateQueries({ queryKey: ['billing-overview'] });
  };
  const createPlan = useMutation({
    mutationFn: (input: CreateBillingPlanInput) => createBillingPlan(input),
    onSuccess: () => {
      setPlan(initialPlan);
      refresh();
      toast.success('Subscription plan created.');
    },
    onError: () => toast.error('Unable to create the subscription plan.'),
  });
  const archivePlan = useMutation({
    mutationFn: (priceId: string) => archiveBillingPlan(priceId),
    onSuccess: () => {
      refresh();
      toast.success('Subscription plan archived.');
    },
    onError: () => toast.error('Unable to archive the subscription plan.'),
  });
  const updateConfiguration = useMutation({
    mutationFn: () => updateStripeConfiguration(stripeConfiguration),
    onSuccess: () => {
      setStripeConfiguration({ secretKey: '', webhookSecret: '' });
      refresh();
      toast.success('Stripe configuration saved.');
    },
    onError: () => toast.error('Unable to validate or save Stripe settings.'),
  });
  const clearConfiguration = useMutation({
    mutationFn: () => clearStripeConfiguration(),
    onSuccess: () => {
      refresh();
      toast.success('Stored Stripe configuration cleared.');
    },
    onError: () => toast.error('Unable to clear Stripe settings.'),
  });

  if (session.isLoading) {
    return (
      <Shell>
        <Skeleton className="h-72 w-full" />
      </Shell>
    );
  }
  if (session.isError || !isAdmin) {
    return (
      <Shell>
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertTitle>Administrator access required</AlertTitle>
          <AlertDescription>
            Your account does not have permission to manage billing.
          </AlertDescription>
        </Alert>
      </Shell>
    );
  }

  const data = settings.data?.data;
  const submitPlan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(plan.price);
    const unitAmount = Math.round(amount * 100);
    const analysisCredits = Number(plan.analysisCredits);
    if (!Number.isFinite(amount) || amount <= 0 || unitAmount < 50) {
      toast.error('Enter a valid price of at least 0.50.');
      return;
    }
    if (!Number.isSafeInteger(analysisCredits) || analysisCredits < 1) {
      toast.error('Enter at least one analysis credit.');
      return;
    }
    createPlan.mutate({
      name: plan.name.trim(),
      description: plan.description.trim() || undefined,
      unitAmount,
      currency: plan.currency,
      interval: plan.interval,
      analysisCredits,
      supportedMarkets: plan.supportedMarkets,
      features: plan.features
        .split(',')
        .map((feature) => feature.trim())
        .filter(Boolean),
    });
  };

  return (
    <Shell>
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Stripe billing</h2>
        <p className="text-sm text-muted-foreground">
          Connection status and recurring subscription plans
        </p>
      </header>
      {settings.isError && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load Stripe settings</AlertTitle>
          <AlertDescription>
            Check the server configuration and retry.
          </AlertDescription>
        </Alert>
      )}
      {settings.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : data ? (
        <Tabs defaultValue="connection">
          <TabsList>
            <TabsTrigger value="connection">
              <CreditCard data-icon="inline-start" /> Connection
            </TabsTrigger>
            <TabsTrigger value="plans">
              <CircleDollarSign data-icon="inline-start" /> Plans
            </TabsTrigger>
          </TabsList>
          <TabsContent value="connection" className="pt-3">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h3>Stripe connection</h3>
                </CardTitle>
                <CardDescription>
                  Server-side payment provider configuration
                </CardDescription>
                <CardAction>
                  <Badge
                    variant={data.connectionHealthy ? 'default' : 'secondary'}
                  >
                    {data.connectionHealthy
                      ? 'Connected'
                      : data.configured
                        ? 'Connection error'
                        : 'Not configured'}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <StatusItem
                    label="Environment"
                    value={formatMode(data.mode)}
                    ready={data.connectionHealthy}
                  />
                  <StatusItem
                    label="Webhook signing"
                    value={data.webhookConfigured ? 'Configured' : 'Missing'}
                    ready={data.webhookConfigured}
                  />
                  <StatusItem
                    label="Configuration source"
                    value={formatConfigurationSource(data.configurationSource)}
                    ready={data.configured}
                  />
                </dl>
                <Field>
                  <FieldLabel htmlFor="stripe-webhook-url">
                    Webhook endpoint
                  </FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="stripe-webhook-url"
                      value={data.webhookUrl}
                      readOnly
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      title="Copy webhook endpoint"
                      aria-label="Copy webhook endpoint"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(data.webhookUrl)
                          .then(() => toast.success('Webhook endpoint copied.'))
                          .catch(() =>
                            toast.error('Unable to copy the endpoint.'),
                          );
                      }}
                    >
                      <Clipboard />
                    </Button>
                  </div>
                </Field>
                {data.configurationEditable && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      updateConfiguration.mutate();
                    }}
                  >
                    <FieldGroup className="grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="stripe-secret-key">
                          Stripe secret key
                        </FieldLabel>
                        <Input
                          id="stripe-secret-key"
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          required
                          minLength={16}
                          maxLength={256}
                          placeholder={data.secretKeyHint ?? 'sk_test_...'}
                          value={stripeConfiguration.secretKey}
                          onChange={(event) =>
                            setStripeConfiguration((current) => ({
                              ...current,
                              secretKey: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="stripe-webhook-secret">
                          Webhook signing secret
                        </FieldLabel>
                        <Input
                          id="stripe-webhook-secret"
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          required
                          minLength={16}
                          maxLength={256}
                          placeholder={data.webhookSecretHint ?? 'whsec_...'}
                          value={stripeConfiguration.webhookSecret}
                          onChange={(event) =>
                            setStripeConfiguration((current) => ({
                              ...current,
                              webhookSecret: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field className="flex-row flex-wrap justify-end md:col-span-2">
                        {data.configurationSource === 'database' && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={clearConfiguration.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  'Clear the stored Stripe configuration?',
                                )
                              ) {
                                clearConfiguration.mutate();
                              }
                            }}
                          >
                            {clearConfiguration.isPending ? (
                              <Spinner data-icon="inline-start" />
                            ) : (
                              <Trash2 data-icon="inline-start" />
                            )}
                            Clear stored configuration
                          </Button>
                        )}
                        <Button
                          type="submit"
                          disabled={updateConfiguration.isPending}
                        >
                          {updateConfiguration.isPending ? (
                            <Spinner data-icon="inline-start" />
                          ) : (
                            <Save data-icon="inline-start" />
                          )}
                          Save and validate
                        </Button>
                      </Field>
                    </FieldGroup>
                  </form>
                )}
                {!data.configurationEditable && (
                  <Alert>
                    <AlertTitle>Deployment-managed configuration</AlertTitle>
                    <AlertDescription>
                      Stripe credentials can be changed here after encrypted
                      billing configuration is enabled for this deployment.
                    </AlertDescription>
                  </Alert>
                )}
                {data.configured && !data.connectionHealthy && (
                  <Alert variant="destructive">
                    <AlertTitle>Stripe connection failed</AlertTitle>
                    <AlertDescription>
                      Replace or clear the stored credentials, or check Stripe
                      service availability.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="plans" className="flex flex-col gap-4 pt-3">
            <PlanEditor
              plan={plan}
              setPlan={setPlan}
              disabled={!data.configured}
              pending={createPlan.isPending}
              onSubmit={submitPlan}
            />
            <PlansTable
              plans={data.plans}
              pendingId={
                archivePlan.isPending ? archivePlan.variables : undefined
              }
              onArchive={(priceId) => archivePlan.mutate(priceId)}
            />
          </TabsContent>
        </Tabs>
      ) : null}
    </Shell>
  );
}

function PlanEditor({
  plan,
  setPlan,
  disabled,
  pending,
  onSubmit,
}: {
  plan: PlanForm;
  setPlan: React.Dispatch<React.SetStateAction<PlanForm>>;
  disabled: boolean;
  pending: boolean;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
  const change = (values: Partial<PlanForm>) =>
    setPlan((current) => ({ ...current, ...values }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>Create recurring plan</h3>
        </CardTitle>
        <CardDescription>
          Creates a Stripe Product and recurring Price
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="plan-name">Name</FieldLabel>
              <Input
                id="plan-name"
                value={plan.name}
                required
                maxLength={100}
                onChange={(event) => change({ name: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-description">Description</FieldLabel>
              <Input
                id="plan-description"
                value={plan.description}
                maxLength={500}
                onChange={(event) =>
                  change({ description: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-price">Price</FieldLabel>
              <Input
                id="plan-price"
                type="number"
                inputMode="decimal"
                min="0.50"
                step="0.01"
                value={plan.price}
                required
                onChange={(event) => change({ price: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-currency">Currency</FieldLabel>
              <Select
                value={plan.currency}
                onValueChange={(value) =>
                  change({ currency: value as PlanForm['currency'] })
                }
              >
                <SelectTrigger id="plan-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {['usd', 'cny', 'hkd', 'eur'].map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Billing interval</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={plan.interval}
                onValueChange={(value) =>
                  value && change({ interval: value as BillingInterval })
                }
              >
                <ToggleGroupItem value="month">Monthly</ToggleGroupItem>
                <ToggleGroupItem value="year">Yearly</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-credits">Credits per cycle</FieldLabel>
              <Input
                id="plan-credits"
                type="number"
                min="1"
                step="1"
                value={plan.analysisCredits}
                required
                onChange={(event) =>
                  change({ analysisCredits: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel>Supported markets</FieldLabel>
              <ToggleGroup
                type="multiple"
                variant="outline"
                value={plan.supportedMarkets}
                onValueChange={(supportedMarkets) =>
                  supportedMarkets.length && change({ supportedMarkets })
                }
              >
                {['US', 'HK', 'CN', 'CRYPTO'].map((market) => (
                  <ToggleGroupItem key={market} value={market}>
                    {market}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-features">Features</FieldLabel>
              <Input
                id="plan-features"
                value={plan.features}
                required
                placeholder="Full analyst team, PDF reports"
                onChange={(event) => change({ features: event.target.value })}
              />
            </Field>
            <Field className="justify-end md:items-end">
              <Button type="submit" disabled={disabled || pending}>
                {pending && <Spinner data-icon="inline-start" />} Create plan
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function PlansTable({
  plans,
  pendingId,
  onArchive,
}: {
  plans: BillingPlan[];
  pendingId?: string;
  onArchive(priceId: string): void;
}) {
  if (!plans.length) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleDollarSign />
          </EmptyMedia>
          <EmptyTitle>No active plans</EmptyTitle>
          <EmptyDescription>
            Active recurring Stripe prices will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>Active plans</h3>
        </CardTitle>
        <CardAction>
          <Badge variant="secondary">{plans.length}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Interval</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell>
                  <div className="font-medium">{plan.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {plan.description ?? plan.id}
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(plan.unitAmount, plan.currency)}
                </TableCell>
                <TableCell>
                  Every {plan.intervalCount > 1 ? `${plan.intervalCount} ` : ''}
                  {plan.interval}
                </TableCell>
                <TableCell className="tabular-nums">
                  {plan.analysisCredits}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title={`Archive ${plan.name}`}
                    aria-label={`Archive ${plan.name}`}
                    disabled={pendingId === plan.id}
                    onClick={() => onArchive(plan.id)}
                  >
                    <Archive />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <AppShell title="Payment settings">
      <main className="flex flex-1 flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
        {children}
      </main>
    </AppShell>
  );
}

function StatusItem({
  label,
  value,
  ready,
}: {
  label: string;
  value: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {ready ? (
        <CheckCircle2 className="size-4 text-emerald-600" />
      ) : (
        <Webhook className="size-4 text-muted-foreground" />
      )}
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    </div>
  );
}

function formatMode(mode: 'test' | 'live' | 'unconfigured') {
  return mode === 'test'
    ? 'Test mode'
    : mode === 'live'
      ? 'Live mode'
      : 'Unconfigured';
}

function formatConfigurationSource(
  source: 'database' | 'environment' | 'none',
) {
  return source === 'database'
    ? 'Admin managed'
    : source === 'environment'
      ? 'Deployment environment'
      : 'Not configured';
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}
