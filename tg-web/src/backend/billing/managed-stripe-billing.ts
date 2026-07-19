import type { BillingConfigurationStore } from './configuration-store';
import {
  BillingServiceError,
  type BillingLocale,
  type BillingOverview,
  type BillingPlan,
  type BillingService,
  type BillingSettings,
  type CreateBillingCustomerInput,
  type CreateBillingPlanInput,
  type StripeWebhookEvent,
  type UpdateStripeConfigurationInput,
} from './contract';
import {
  createStripeBillingService,
  type StripeBillingOptions,
} from './stripe-billing';

export type ManagedStripeBillingOptions = StripeBillingOptions & {
  configurationStore: BillingConfigurationStore;
};

export function createManagedStripeBillingService(
  options: ManagedStripeBillingOptions,
): BillingService {
  return new ManagedStripeBillingService(options);
}

class ManagedStripeBillingService implements BillingService {
  private cached: { signature: string; service: BillingService } | undefined;

  constructor(private readonly options: ManagedStripeBillingOptions) {}

  async getOverview(customerId: string | null): Promise<BillingOverview> {
    return (await this.resolve()).service.getOverview(customerId);
  }

  async getSettings(): Promise<BillingSettings> {
    let resolved: Awaited<ReturnType<ManagedStripeBillingService['resolve']>>;
    try {
      resolved = await this.resolve();
    } catch {
      return {
        configured: true,
        connectionHealthy: false,
        webhookConfigured: false,
        webhookUrl: new URL(
          '/api/stripe/webhook',
          this.options.appBaseUrl,
        ).toString(),
        mode: 'unconfigured',
        plans: [],
        configurationSource: 'database',
        configurationEditable: this.options.configurationStore.editable,
        secretKeyHint: null,
        webhookSecretHint: null,
        updatedAt: null,
      };
    }
    let settings: BillingSettings;
    try {
      settings = await resolved.service.getSettings();
    } catch {
      settings = {
        configured: Boolean(resolved.secretKey),
        connectionHealthy: false,
        webhookConfigured: Boolean(resolved.webhookSecret),
        webhookUrl: new URL(
          '/api/stripe/webhook',
          this.options.appBaseUrl,
        ).toString(),
        mode: resolved.secretKey?.startsWith('sk_live_')
          ? 'live'
          : resolved.secretKey
            ? 'test'
            : 'unconfigured',
        plans: [],
        configurationSource: resolved.source,
        configurationEditable: this.options.configurationStore.editable,
        secretKeyHint: null,
        webhookSecretHint: null,
        updatedAt: null,
      };
    }
    return {
      ...settings,
      configurationSource: resolved.source,
      configurationEditable: this.options.configurationStore.editable,
      secretKeyHint: hint(resolved.secretKey),
      webhookSecretHint: hint(resolved.webhookSecret),
      updatedAt: resolved.updatedAt
        ? Math.floor(resolved.updatedAt.getTime() / 1000)
        : null,
    };
  }

  async createCustomer(input: CreateBillingCustomerInput): Promise<string> {
    return (await this.resolve()).service.createCustomer(input);
  }

  async createCheckout(
    customerId: string,
    priceId: string,
    idempotencyKey: string,
    locale: BillingLocale,
  ): Promise<string> {
    return (await this.resolve()).service.createCheckout(
      customerId,
      priceId,
      idempotencyKey,
      locale,
    );
  }

  async createPortal(
    customerId: string,
    locale: BillingLocale,
  ): Promise<string> {
    return (await this.resolve()).service.createPortal(customerId, locale);
  }

  async createPlan(input: CreateBillingPlanInput): Promise<BillingPlan> {
    return (await this.resolve()).service.createPlan(input);
  }

  async provisionDefaultPlans(): Promise<BillingPlan[]> {
    return (await this.resolve()).service.provisionDefaultPlans();
  }

  async archivePlan(priceId: string): Promise<void> {
    return (await this.resolve()).service.archivePlan(priceId);
  }

  async updateConfiguration(
    input: UpdateStripeConfigurationInput,
  ): Promise<BillingSettings> {
    this.requireEditable();
    const candidate = createStripeBillingService({
      secretKey: input.secretKey,
      webhookSecret: input.webhookSecret,
      appBaseUrl: this.options.appBaseUrl,
    });
    await candidate.getSettings();
    await this.options.configurationStore.save(input);
    this.cached = undefined;
    return this.getSettings();
  }

  async clearConfiguration(actorClerkUserId: string): Promise<BillingSettings> {
    this.requireEditable();
    await this.options.configurationStore.clear(actorClerkUserId);
    this.cached = undefined;
    return this.getSettings();
  }

  async handleWebhook(
    payload: string,
    signature: string,
  ): Promise<StripeWebhookEvent> {
    return (await this.resolve()).service.handleWebhook(payload, signature);
  }

  private async resolve() {
    const databaseConfiguration = await this.options.configurationStore.load();
    const secretKey =
      databaseConfiguration?.secretKey ?? this.options.secretKey;
    const webhookSecret =
      databaseConfiguration?.webhookSecret ?? this.options.webhookSecret;
    const source = databaseConfiguration
      ? ('database' as const)
      : secretKey
        ? ('environment' as const)
        : ('none' as const);
    const signature = [source, secretKey ?? '', webhookSecret ?? ''].join(':');
    if (this.cached?.signature !== signature) {
      this.cached = {
        signature,
        service: createStripeBillingService({
          secretKey,
          webhookSecret,
          appBaseUrl: this.options.appBaseUrl,
        }),
      };
    }
    return {
      service: this.cached.service,
      source,
      secretKey,
      webhookSecret,
      updatedAt: databaseConfiguration?.updatedAt ?? null,
    };
  }

  private requireEditable() {
    if (!this.options.configurationStore.editable) {
      throw new BillingServiceError(
        'BILLING_CONFIGURATION_NOT_EDITABLE',
        503,
        'Billing configuration encryption is not configured',
      );
    }
  }
}

function hint(value: string | undefined) {
  if (!value) return null;
  const prefix = value.startsWith('whsec_')
    ? 'whsec_'
    : value.startsWith('sk_live_')
      ? 'sk_live_'
      : value.startsWith('sk_test_')
        ? 'sk_test_'
        : '';
  return `${prefix}...${value.slice(-4)}`;
}
