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
  ScrollText,
  Search,
  Webhook,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PRODUCT_MARKET_CODES } from '@/shared/product-markets';
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
import { Checkbox } from '@/frontend/components/ui/checkbox';
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
  formatLocaleCurrency,
  formatLocaleDateTimeValue,
} from '@/frontend/lib/format-locale';
import {
  localizeBillingInterval,
  localizeBillingPlan,
} from '@/frontend/lib/localize-billing-plan';
import {
  archiveBillingPlan,
  createBillingPlan,
  getBillingSettings,
  listAdminStripeEvents,
  provisionDefaultBillingPlans,
  type AdminStripeWebhookEvent,
} from '@/frontend/lib/billing';

const BILLING_TABS = ['connection', 'plans', 'events'] as const;
type BillingTab = (typeof BILLING_TABS)[number];

function resolveBillingTab(value: string | null): BillingTab {
  return BILLING_TABS.includes(value as BillingTab)
    ? (value as BillingTab)
    : 'connection';
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab = resolveBillingTab(requestedTab);
  const [plan, setPlan] = useState(() =>
    createInitialPlan(t('billing.defaults.features')),
  );
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

  if (requestedTab === 'credits') {
    return <Navigate replace to="/admin/billing/analysis" />;
  }

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
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const next = resolveBillingTab(value);
              setSearchParams(
                next === 'connection' ? {} : { tab: next },
                { replace: true },
              );
            }}
          >
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
              <TabsTrigger
                value="events"
                className="rounded-none border-b-2 border-transparent px-3 pb-2.5 data-active:border-primary data-active:bg-transparent data-active:shadow-none"
              >
                <ScrollText data-icon="inline-start" />{' '}
                {t('billing.tabs.events')}
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
                  {(data.secretKeyHint || data.webhookSecretHint) && (
                    <dl className="grid gap-4 sm:grid-cols-2">
                      {data.secretKeyHint ? (
                        <StatusItem
                          label={t('billing.connection.secretKey')}
                          value={data.secretKeyHint}
                          ready={data.configured}
                        />
                      ) : null}
                      {data.webhookSecretHint ? (
                        <StatusItem
                          label={t('billing.connection.webhookSecret')}
                          value={data.webhookSecretHint}
                          ready={data.webhookConfigured}
                        />
                      ) : null}
                    </dl>
                  )}
                  <Alert>
                    <AlertTitle>
                      {t('billing.connection.deploymentManaged.title')}
                    </AlertTitle>
                    <AlertDescription>
                      {t('billing.connection.deploymentManaged.body')}
                    </AlertDescription>
                  </Alert>
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
            <TabsContent value="events" className="pt-3">
              <StripeEventsPanel enabled={isAdmin && activeTab === 'events'} />
            </TabsContent>
          </Tabs>
        ) : null}
      </PageFrame>
    </AdminGate>
  );
}

function StripeEventsPanel({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation('admin');
  const [status, setStatus] = useState<string>('all');
  const [eventType, setEventType] = useState('');
  const [applied, setApplied] = useState({
    status: 'all' as string,
    eventType: '',
  });

  const events = useQuery({
    queryKey: ['admin-stripe-events', applied],
    queryFn: () =>
      listAdminStripeEvents({
        status:
          applied.status === 'all'
            ? undefined
            : (applied.status as AdminStripeWebhookEvent['status']),
        eventType: applied.eventType || undefined,
        days: 30,
        limit: 100,
      }),
    enabled,
  });

  function onFilter(event: FormEvent) {
    event.preventDefault();
    setApplied({
      status,
      eventType: eventType.trim(),
    });
  }

  const summary = events.data?.data.summary;
  const rows = events.data?.data.events ?? [];

  return (
    <SectionPanel
      title={t('billing.events.title')}
      description={t('billing.events.description')}
    >
      <form
        onSubmit={onFilter}
        className="mb-4 flex flex-wrap items-end gap-3"
      >
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t('billing.events.statusAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">
                {t('billing.events.statusAll')}
              </SelectItem>
              {(
                ['processed', 'failed', 'ignored', 'processing'] as const
              ).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`billing.events.status.${value}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Input
          className="max-w-xs"
          placeholder={t('billing.events.eventTypePlaceholder')}
          value={eventType}
          onChange={(event) => setEventType(event.target.value)}
        />
        <Button type="submit">
          <Search data-icon="inline-start" />
          {t('billing.events.filter')}
        </Button>
      </form>

      {summary ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge variant="outline">
            {t('billing.events.summary.processed', {
              count: summary.processed,
            })}
          </Badge>
          <Badge variant="destructive">
            {t('billing.events.summary.failed', { count: summary.failed })}
          </Badge>
          <Badge variant="secondary">
            {t('billing.events.summary.ignored', { count: summary.ignored })}
          </Badge>
          <Badge variant="info">
            {t('billing.events.summary.processing', {
              count: summary.processing,
            })}
          </Badge>
        </div>
      ) : null}

      {events.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : events.isError ? (
        <Alert variant="destructive">
          <AlertTitle>{t('billing.events.loadError.title')}</AlertTitle>
          <AlertDescription>
            {t('billing.events.loadError.body')}
          </AlertDescription>
        </Alert>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('billing.events.columns.when')}</TableHead>
              <TableHead>{t('billing.events.columns.type')}</TableHead>
              <TableHead>{t('billing.events.columns.status')}</TableHead>
              <TableHead>{t('billing.events.columns.ids')}</TableHead>
              <TableHead>{t('billing.events.columns.error')}</TableHead>
              <TableHead>{t('billing.events.columns.eventId')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  {t('billing.events.empty')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.stripeEventId}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatLocaleDateTimeValue(String(row.receivedAt))}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.eventType}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.status === 'failed'
                          ? 'destructive'
                          : row.status === 'processed'
                            ? 'default'
                            : row.status === 'processing'
                              ? 'info'
                              : 'secondary'
                      }
                    >
                      {t(`billing.events.status.${row.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[14rem] truncate font-mono text-xs text-muted-foreground">
                    {[row.customerId, row.subscriptionId, row.invoiceId]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate text-xs text-muted-foreground">
                    {row.error ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.stripeEventId}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </SectionPanel>
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
                {PRODUCT_MARKET_CODES.map((market) => (
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
                    <div className="font-normal">{displayPlan.name}</div>
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
