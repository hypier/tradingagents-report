import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  CheckCircle2,
  CircleDollarSign,
  Clipboard,
  CreditCard,
  PackagePlus,
  Save,
  Trash2,
  Webhook,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type {
  BillingInterval,
  BillingPlan,
  CreateBillingPlanInput,
} from '@/backend/billing/contract';
import { AdminGate } from '@/frontend/components/admin-gate';
import { PageFrame, SectionPanel } from '@/frontend/components/page-chrome';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/frontend/components/ui/alert';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
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
import { formatLocaleCurrency } from '@/frontend/lib/format-locale';
import {
  localizeBillingInterval,
  localizeBillingPlan,
} from '@/frontend/lib/localize-billing-plan';
import {
  archiveBillingPlan,
  clearStripeConfiguration,
  createBillingPlan,
  getBillingSettings,
  provisionDefaultBillingPlans,
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

function createInitialPlan(features: string): PlanForm {
  return {
    name: '',
    description: '',
    price: '',
    currency: 'usd',
    interval: 'month',
    analysisCredits: '20',
    supportedMarkets: ['US'],
    features,
  };
}

export function AdminBillingPage() {
  const { t } = useTranslation('admin');
  const [plan, setPlan] = useState(() =>
    createInitialPlan(t('billing.defaults.features')),
  );
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
      setPlan(createInitialPlan(t('billing.defaults.features')));
      refresh();
      toast.success(t('billing.toasts.planCreated'));
    },
    onError: () => toast.error(t('billing.toasts.planCreateError')),
  });
  const provisionPlans = useMutation({
    mutationFn: () => provisionDefaultBillingPlans(),
    onSuccess: () => {
      refresh();
      toast.success(t('billing.toasts.defaultsProvisioned'));
    },
    onError: () => toast.error(t('billing.toasts.defaultsProvisionError')),
  });
  const archivePlan = useMutation({
    mutationFn: (priceId: string) => archiveBillingPlan(priceId),
    onSuccess: () => {
      refresh();
      toast.success(t('billing.toasts.planArchived'));
    },
    onError: () => toast.error(t('billing.toasts.planArchiveError')),
  });
  const updateConfiguration = useMutation({
    mutationFn: () => updateStripeConfiguration(stripeConfiguration),
    onSuccess: () => {
      setStripeConfiguration({ secretKey: '', webhookSecret: '' });
      refresh();
      toast.success(t('billing.toasts.configSaved'));
    },
    onError: () => toast.error(t('billing.toasts.configSaveError')),
  });
  const clearConfiguration = useMutation({
    mutationFn: () => clearStripeConfiguration(),
    onSuccess: () => {
      refresh();
      toast.success(t('billing.toasts.configCleared'));
    },
    onError: () => toast.error(t('billing.toasts.configClearError')),
  });

  const data = settings.data?.data;
  const submitPlan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(plan.price);
    const unitAmount = Math.round(amount * 100);
    const analysisCredits = Number(plan.analysisCredits);
    if (!Number.isFinite(amount) || amount <= 0 || unitAmount < 50) {
      toast.error(t('billing.toasts.invalidPrice'));
      return;
    }
    if (!Number.isSafeInteger(analysisCredits) || analysisCredits < 1) {
      toast.error(t('billing.toasts.invalidCredits'));
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
    <AdminGate
      accessTitle={t('billing.accessRequired.title')}
      accessBody={t('billing.accessRequired.body')}
    >
      <PageFrame
        title={t('billing.heading')}
        description={t('billing.subtitle')}
      >
        {settings.isError && (
          <Alert variant="destructive">
            <AlertTitle>{t('billing.loadError.title')}</AlertTitle>
            <AlertDescription>{t('billing.loadError.body')}</AlertDescription>
          </Alert>
        )}
        {settings.isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : data ? (
          <Tabs defaultValue="connection">
            <TabsList variant="line" className="h-auto w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0">
              <TabsTrigger
                value="connection"
                className="rounded-none border-b-2 border-transparent px-3 pb-2.5 data-active:border-primary data-active:bg-transparent data-active:shadow-none"
              >
                <CreditCard data-icon="inline-start" />{' '}
                {t('billing.tabs.connection')}
              </TabsTrigger>
              <TabsTrigger
                value="plans"
                className="rounded-none border-b-2 border-transparent px-3 pb-2.5 data-active:border-primary data-active:bg-transparent data-active:shadow-none"
              >
                <CircleDollarSign data-icon="inline-start" />{' '}
                {t('billing.tabs.plans')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="connection" className="pt-3">
              <SectionPanel
                title={t('billing.connection.title')}
                description={t('billing.connection.description')}
                actions={
                  <Badge
                    variant={data.connectionHealthy ? 'default' : 'secondary'}
                  >
                    {data.connectionHealthy
                      ? t('billing.connection.connected')
                      : data.configured
                        ? t('billing.connection.connectionError')
                        : t('billing.connection.notConfigured')}
                  </Badge>
                }
              >
                <div className="flex flex-col gap-5">
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <StatusItem
                      label={t('billing.connection.environment')}
                      value={t(`billing.connection.mode.${data.mode}`)}
                      ready={data.connectionHealthy}
                    />
                    <StatusItem
                      label={t('billing.connection.webhookSigning')}
                      value={
                        data.webhookConfigured
                          ? t('billing.connection.configured')
                          : t('billing.connection.missing')
                      }
                      ready={data.webhookConfigured}
                    />
                    <StatusItem
                      label={t('billing.connection.configurationSource')}
                      value={t(
                        `billing.connection.source.${data.configurationSource}`,
                      )}
                      ready={data.configured}
                    />
                  </dl>
                  <Field>
                    <FieldLabel htmlFor="stripe-webhook-url">
                      {t('billing.connection.webhookEndpoint')}
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
                        title={t('billing.connection.copyEndpoint')}
                        aria-label={t('billing.connection.copyEndpoint')}
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(data.webhookUrl)
                            .then(() =>
                              toast.success(t('billing.connection.copied')),
                            )
                            .catch(() =>
                              toast.error(t('billing.connection.copyError')),
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
                            {t('billing.connection.secretKey')}
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
                            {t('billing.connection.webhookSecret')}
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
                                    t('billing.connection.clearConfirm'),
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
                              {t('billing.connection.clearStored')}
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
                            {t('billing.connection.saveValidate')}
                          </Button>
                        </Field>
                      </FieldGroup>
                    </form>
                  )}
                  {!data.configurationEditable && (
                    <Alert>
                      <AlertTitle>
                        {t('billing.connection.deploymentManaged.title')}
                      </AlertTitle>
                      <AlertDescription>
                        {t('billing.connection.deploymentManaged.body')}
                      </AlertDescription>
                    </Alert>
                  )}
                  {data.configured && !data.connectionHealthy && (
                    <Alert variant="destructive">
                      <AlertTitle>
                        {t('billing.connection.connectionFailed.title')}
                      </AlertTitle>
                      <AlertDescription>
                        {t('billing.connection.connectionFailed.body')}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </SectionPanel>
            </TabsContent>
            <TabsContent value="plans" className="flex flex-col gap-4 pt-3">
              <PlanEditor
                plan={plan}
                setPlan={setPlan}
                disabled={!data.configured}
                pending={createPlan.isPending}
                provisioning={provisionPlans.isPending}
                onProvisionDefaults={() => provisionPlans.mutate()}
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
      </PageFrame>
    </AdminGate>
  );
}

function PlanEditor({
  plan,
  setPlan,
  disabled,
  pending,
  provisioning,
  onProvisionDefaults,
  onSubmit,
}: {
  plan: PlanForm;
  setPlan: React.Dispatch<React.SetStateAction<PlanForm>>;
  disabled: boolean;
  pending: boolean;
  provisioning: boolean;
  onProvisionDefaults(): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
  const { t } = useTranslation('admin');
  const change = (values: Partial<PlanForm>) =>
    setPlan((current) => ({ ...current, ...values }));
  return (
    <SectionPanel
      title={t('billing.plans.createTitle')}
      description={t('billing.plans.createDescription')}
      actions={
        <Button
          type="button"
          variant="outline"
          disabled={disabled || provisioning}
          onClick={onProvisionDefaults}
        >
          {provisioning ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <PackagePlus data-icon="inline-start" />
          )}
          {t('billing.plans.provisionDefaults')}
        </Button>
      }
    >
        <form onSubmit={onSubmit}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="plan-name">
                {t('billing.plans.name')}
              </FieldLabel>
              <Input
                id="plan-name"
                value={plan.name}
                required
                maxLength={100}
                onChange={(event) => change({ name: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-description">
                {t('billing.plans.description')}
              </FieldLabel>
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
              <FieldLabel htmlFor="plan-price">
                {t('billing.plans.price')}
              </FieldLabel>
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
              <FieldLabel htmlFor="plan-currency">
                {t('billing.plans.currency')}
              </FieldLabel>
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
              <FieldLabel>{t('billing.plans.interval')}</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={plan.interval}
                onValueChange={(value) =>
                  value && change({ interval: value as BillingInterval })
                }
              >
                <ToggleGroupItem value="month">
                  {t('billing.plans.monthly')}
                </ToggleGroupItem>
                <ToggleGroupItem value="year">
                  {t('billing.plans.yearly')}
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-credits">
                {t('billing.plans.credits')}
              </FieldLabel>
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
              <FieldLabel>{t('billing.plans.markets')}</FieldLabel>
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
              <FieldLabel htmlFor="plan-features">
                {t('billing.plans.features')}
              </FieldLabel>
              <Input
                id="plan-features"
                value={plan.features}
                required
                placeholder={t('billing.plans.featuresPlaceholder')}
                onChange={(event) => change({ features: event.target.value })}
              />
            </Field>
            <Field className="justify-end md:items-end">
              <Button type="submit" disabled={disabled || pending}>
                {pending && <Spinner data-icon="inline-start" />}{' '}
                {t('billing.plans.create')}
              </Button>
            </Field>
          </FieldGroup>
        </form>
    </SectionPanel>
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
  const { t } = useTranslation('admin');
  if (!plans.length) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleDollarSign />
          </EmptyMedia>
          <EmptyTitle>{t('billing.plans.emptyTitle')}</EmptyTitle>
          <EmptyDescription>{t('billing.plans.emptyBody')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <SectionPanel
      title={t('billing.plans.activeTitle')}
      actions={<Badge variant="secondary">{plans.length}</Badge>}
    >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('billing.plans.columns.plan')}</TableHead>
              <TableHead>{t('billing.plans.columns.price')}</TableHead>
              <TableHead>{t('billing.plans.columns.interval')}</TableHead>
              <TableHead>{t('billing.plans.columns.credits')}</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => {
              const displayPlan = localizeBillingPlan(
                plan,
                t,
                'billing.plans.defaultPlans',
              );
              const interval = localizeBillingInterval(
                plan.interval,
                t,
                'billing.plans.intervals',
              );
              return (
                <TableRow key={plan.id} className="h-11">
                  <TableCell>
                    <div className="font-medium">{displayPlan.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {displayPlan.description ?? plan.id}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {formatLocaleCurrency(plan.unitAmount, plan.currency)}
                  </TableCell>
                  <TableCell>
                    {plan.intervalCount > 1
                      ? t('billing.plans.everyCount', {
                          count: plan.intervalCount,
                          interval,
                        })
                      : t('billing.plans.every', { interval })}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {plan.analysisCredits}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title={t('billing.plans.archive', {
                        name: displayPlan.name,
                      })}
                      aria-label={t('billing.plans.archive', {
                        name: displayPlan.name,
                      })}
                      disabled={pendingId === plan.id}
                      onClick={() => onArchive(plan.id)}
                    >
                      <Archive />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
    </SectionPanel>
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
