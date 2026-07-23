import Stripe from 'stripe';

import {
  BillingServiceError,
  type AdminStripePeriodSummary,
  type BillingInvoice,
  type BillingLocale,
  type BillingOverview,
  type BillingPlan,
  type BillingService,
  type BillingSettings,
  type BillingSubscription,
  type CreateBillingCustomerInput,
  type CreateBillingPlanInput,
  type StripeSubscriptionSnapshot,
  type StripeWebhookEvent,
  type UpdateBillingPlanInput,
} from './contract';
import {
  DEFAULT_MONTHLY_BILLING_PLANS,
  type DefaultBillingPlanDefinition,
} from './default-plans';

export type StripeBillingOptions = {
  secretKey?: string;
  webhookSecret?: string;
  appBaseUrl: URL;
};

const MANAGEABLE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'paused',
  'incomplete',
]);

export function createStripeBillingService(
  options: StripeBillingOptions,
): BillingService {
  if (!options.secretKey) {
    return new UnavailableBillingService(options);
  }
  return new StripeBillingService(options);
}

class StripeBillingService implements BillingService {
  private readonly stripe: Stripe;
  private readonly cryptoProvider: ReturnType<
    typeof Stripe.createSubtleCryptoProvider
  >;

  constructor(private readonly options: StripeBillingOptions) {
    this.stripe = new Stripe(options.secretKey!, {
      httpClient: Stripe.createFetchHttpClient(),
    });
    this.cryptoProvider = Stripe.createSubtleCryptoProvider();
  }

  async getOverview(customerId: string | null): Promise<BillingOverview> {
    const plansPromise = this.listPlans();
    if (!customerId) {
      return {
        configured: true,
        plans: await plansPromise,
        subscription: null,
        invoices: [],
      };
    }

    try {
      const [plans, subscriptions, invoices] = await Promise.all([
        plansPromise,
        this.stripe.subscriptions.list({
          customer: customerId,
          status: 'all',
          limit: 10,
        }),
        this.stripe.invoices.list({ customer: customerId, limit: 10 }),
      ]);

      const subscription = subscriptions.data.find((candidate) =>
        MANAGEABLE_SUBSCRIPTION_STATUSES.has(candidate.status),
      );

      return {
        configured: true,
        plans,
        subscription: subscription
          ? mapSubscription(
              subscription,
              plans.find(
                (plan) => plan.id === subscription.items.data[0]?.price.id,
              )?.name,
            )
          : null,
        invoices: invoices.data.map(mapInvoice),
      };
    } catch (error) {
      // Stale local/dev customer IDs should not break the whole overview.
      if (isMissingStripeCustomer(error)) {
        return {
          configured: true,
          plans: await plansPromise,
          subscription: null,
          invoices: [],
        };
      }
      throw error;
    }
  }

  async getSettings(): Promise<BillingSettings> {
    const [plans, archivedPlans] = await Promise.all([
      this.listPlans(),
      this.listArchivedPlans(),
    ]);
    return {
      configured: true,
      connectionHealthy: true,
      webhookConfigured: Boolean(this.options.webhookSecret),
      webhookUrl: new URL(
        '/api/stripe/webhook',
        this.options.appBaseUrl,
      ).toString(),
      mode: this.options.secretKey!.startsWith('sk_live_') ? 'live' : 'test',
      plans,
      archivedPlans,
      configurationSource: 'environment',
      secretKeyHint: secretHint(this.options.secretKey),
      webhookSecretHint: secretHint(this.options.webhookSecret),
    };
  }

  async getAdminPeriodSummary(input: {
    from: Date;
    to: Date;
  }): Promise<AdminStripePeriodSummary | null> {
    const created = {
      gte: Math.floor(input.from.getTime() / 1000),
      lte: Math.floor(input.to.getTime() / 1000),
    };
    const currencyTotals = new Map<
      string,
      { revenueCents: number; refundCents: number }
    >();

    let startingAfter: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const batch = await this.stripe.balanceTransactions.list({
        created,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const tx of batch.data) {
        const currency = tx.currency.toUpperCase();
        const bucket = currencyTotals.get(currency) ?? {
          revenueCents: 0,
          refundCents: 0,
        };
        if (tx.type === 'charge' || tx.type === 'payment') {
          bucket.revenueCents += tx.amount;
        } else if (tx.type === 'refund' || tx.type === 'payment_refund') {
          bucket.refundCents += Math.abs(tx.amount);
        }
        currencyTotals.set(currency, bucket);
      }
      if (!batch.has_more || batch.data.length === 0) break;
      startingAfter = batch.data.at(-1)?.id;
    }

    let paymentFailureCount = 0;
    startingAfter = undefined;
    for (let page = 0; page < 10; page += 1) {
      const batch = await this.stripe.events.list({
        type: 'invoice.payment_failed',
        created,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      paymentFailureCount += batch.data.length;
      if (!batch.has_more || batch.data.length === 0) break;
      startingAfter = batch.data.at(-1)?.id;
    }

    let currency = 'USD';
    let revenueCents = 0;
    let refundCents = 0;
    let bestVolume = -1;
    for (const [candidate, totals] of currencyTotals) {
      const volume = totals.revenueCents + totals.refundCents;
      const preferUsd =
        volume === bestVolume && candidate === 'USD' && currency !== 'USD';
      if (volume > bestVolume || preferUsd) {
        bestVolume = volume;
        currency = candidate;
        revenueCents = totals.revenueCents;
        refundCents = totals.refundCents;
      }
    }

    return {
      currency,
      revenueCents,
      refundCents,
      paymentFailureCount,
    };
  }

  async createCustomer(input: CreateBillingCustomerInput): Promise<string> {
    const customer = await this.stripe.customers.create(
      {
        email: input.email ?? undefined,
        name: input.displayName,
        metadata: { clerk_user_id: input.clerkUserId },
      },
      { idempotencyKey: `tg-customer-${input.clerkUserId}` },
    );
    return customer.id;
  }

  async createCheckout(
    customerId: string,
    priceId: string,
    idempotencyKey: string,
    locale: BillingLocale,
  ): Promise<string> {
    const [price, subscriptions] = await Promise.all([
      this.stripe.prices.retrieve(priceId),
      this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 10,
      }),
    ]);
    if (
      !price.active ||
      !price.recurring ||
      metadataInteger(price.metadata.analysis_credits) < 1
    ) {
      throw new BillingServiceError(
        'INVALID_BILLING_PLAN',
        400,
        'The selected subscription plan is unavailable',
      );
    }
    if (
      subscriptions.data.some((subscription) =>
        MANAGEABLE_SUBSCRIPTION_STATUSES.has(subscription.status),
      )
    ) {
      throw new BillingServiceError(
        'SUBSCRIPTION_ALREADY_EXISTS',
        409,
        'Manage the existing subscription in the billing portal',
      );
    }

    const session = await this.stripe.checkout.sessions.create(
      {
        customer: customerId,
        locale,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        success_url: new URL(
          '/billing?checkout=success',
          this.options.appBaseUrl,
        ).toString(),
        cancel_url: new URL(
          '/billing?checkout=canceled',
          this.options.appBaseUrl,
        ).toString(),
        subscription_data: {
          metadata: { source: 'tradingagents-web' },
        },
      },
      { idempotencyKey: `tg-checkout-${customerId}-${idempotencyKey}` },
    );
    if (!session.url) {
      throw new BillingServiceError(
        'STRIPE_SESSION_UNAVAILABLE',
        502,
        'Stripe did not return a Checkout URL',
      );
    }
    return session.url;
  }

  async createPortal(
    customerId: string,
    locale: BillingLocale,
    priceId?: string,
  ): Promise<string> {
    const returnUrl = new URL(
      '/billing',
      this.options.appBaseUrl,
    ).toString();
    if (!priceId) {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        locale,
        return_url: returnUrl,
      });
      if (!session.url) {
        throw new BillingServiceError(
          'BILLING_PORTAL_UNAVAILABLE',
          502,
          'Stripe did not return a billing portal URL',
        );
      }
      return session.url;
    }

    const [price, subscriptions] = await Promise.all([
      this.stripe.prices.retrieve(priceId),
      this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 10,
      }),
    ]);
    if (
      !price.active ||
      !price.recurring ||
      metadataInteger(price.metadata.analysis_credits) < 1
    ) {
      throw new BillingServiceError(
        'INVALID_BILLING_PLAN',
        400,
        'The selected subscription plan is unavailable',
      );
    }

    const subscription = subscriptions.data.find((candidate) =>
      MANAGEABLE_SUBSCRIPTION_STATUSES.has(candidate.status),
    );
    const item = subscription?.items.data[0];
    if (!subscription || !item) {
      throw new BillingServiceError(
        'SUBSCRIPTION_NOT_FOUND',
        404,
        'No manageable subscription found',
      );
    }
    if (item.price.id === priceId) {
      throw new BillingServiceError(
        'SAME_BILLING_PLAN',
        409,
        'Already subscribed to this plan',
      );
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      locale,
      return_url: returnUrl,
      flow_data: {
        type: 'subscription_update_confirm',
        subscription_update_confirm: {
          subscription: subscription.id,
          items: [
            {
              id: item.id,
              price: priceId,
              quantity: item.quantity ?? 1,
            },
          ],
        },
      },
    });
    if (!session.url) {
      throw new BillingServiceError(
        'BILLING_PORTAL_UNAVAILABLE',
        502,
        'Stripe did not return a billing portal URL',
      );
    }
    return session.url;
  }

  async createPlan(input: CreateBillingPlanInput): Promise<BillingPlan> {
    return this.createManagedPlan(input);
  }

  async updatePlan(
    priceId: string,
    input: UpdateBillingPlanInput,
  ): Promise<BillingPlan> {
    const price = await this.requireManagedPrice(priceId, {
      expand: ['product'],
    });
    const product = expandedProduct(price);
    const metadata = {
      managed_by: 'tradingagents-web',
      analysis_credits: String(input.analysisCredits),
      ...(price.metadata.catalog_key
        ? { catalog_key: price.metadata.catalog_key }
        : {}),
    };
    await this.stripe.products.update(product.id, {
      name: input.name,
      description: input.description || undefined,
      metadata: {
        ...product.metadata,
        ...metadata,
        supported_markets: JSON.stringify(input.supportedMarkets),
        features: JSON.stringify(input.features),
      },
    });
    await this.stripe.prices.update(price.id, {
      metadata: { ...price.metadata, ...metadata },
    });
    const updated = await this.stripe.prices.retrieve(price.id, {
      expand: ['product'],
    });
    return mapPlan(updated, expandedProduct(updated));
  }

  async provisionDefaultPlans(): Promise<BillingPlan[]> {
    const prices = await this.stripe.prices.list({
      type: 'recurring',
      limit: 100,
      expand: ['data.product'],
    });
    const plans: BillingPlan[] = [];
    for (const definition of DEFAULT_MONTHLY_BILLING_PLANS) {
      const current = prices.data.filter(
        (price) => price.metadata.catalog_key === definition.catalogKey,
      );
      const legacy = prices.data.filter(
        (price) => price.metadata.catalog_key === definition.legacyCatalogKey,
      );
      if (current.length > 1 || legacy.length > 1) {
        throw new BillingServiceError(
          'DEFAULT_BILLING_PLAN_CONFLICT',
          409,
          `Stripe has duplicate plans for ${definition.catalogKey}`,
        );
      }
      if (current[0] && legacy[0]) {
        await this.upgradeLegacyDefaultPlan(legacy[0], definition, false);
      }
      plans.push(
        current[0]
          ? await this.restoreDefaultPlan(current[0], definition)
          : legacy[0]
            ? await this.upgradeLegacyDefaultPlan(legacy[0], definition, true)
            : await this.createManagedPlan(definition, definition.catalogKey),
      );
    }
    return plans;
  }

  private async createManagedPlan(
    input: CreateBillingPlanInput,
    catalogKey?: string,
  ): Promise<BillingPlan> {
    const metadata = {
      managed_by: 'tradingagents-web',
      analysis_credits: String(input.analysisCredits),
      ...(catalogKey ? { catalog_key: catalogKey } : {}),
    };
    let product = await this.stripe.products.create(
      {
        name: input.name,
        description: input.description,
        metadata: {
          ...metadata,
          supported_markets: JSON.stringify(input.supportedMarkets),
          features: JSON.stringify(input.features),
        },
      },
      catalogKey
        ? { idempotencyKey: `tg-default-product-${catalogKey}` }
        : undefined,
    );
    if (catalogKey && !product.active) {
      product = await this.stripe.products.update(product.id, { active: true });
    }

    try {
      const price = await this.stripe.prices.create(
        {
          product: product.id,
          unit_amount: input.unitAmount,
          currency: input.currency,
          recurring: { interval: input.interval },
          metadata,
        },
        catalogKey
          ? { idempotencyKey: `tg-default-price-${catalogKey}` }
          : undefined,
      );
      return mapPlan(price, product);
    } catch (error) {
      await this.stripe.products.update(product.id, { active: false });
      throw error;
    }
  }

  private async restoreDefaultPlan(
    price: Stripe.Price,
    definition: DefaultBillingPlanDefinition,
  ): Promise<BillingPlan> {
    const product = expandedProduct(price);
    if (!defaultPlanMatches(price, product, definition)) {
      throw new BillingServiceError(
        'DEFAULT_BILLING_PLAN_CONFLICT',
        409,
        `Stripe plan ${definition.catalogKey} does not match the default catalog`,
      );
    }
    if (!product.active) {
      await this.stripe.products.update(product.id, { active: true });
    }
    if (!price.active) {
      await this.stripe.prices.update(price.id, { active: true });
    }
    const restored = await this.stripe.prices.retrieve(price.id, {
      expand: ['product'],
    });
    return mapPlan(restored, expandedProduct(restored));
  }

  private async upgradeLegacyDefaultPlan(
    price: Stripe.Price,
    definition: DefaultBillingPlanDefinition,
    promote: boolean,
  ): Promise<BillingPlan> {
    const product = expandedProduct(price);
    if (!defaultPlanTermsMatch(price, product, definition)) {
      throw new BillingServiceError(
        'DEFAULT_BILLING_PLAN_CONFLICT',
        409,
        `Stripe plan ${definition.legacyCatalogKey} does not match the default catalog`,
      );
    }
    const catalogKey = promote
      ? definition.catalogKey
      : definition.legacyCatalogKey;
    const metadata = {
      managed_by: 'tradingagents-web',
      catalog_key: catalogKey,
      analysis_credits: String(definition.analysisCredits),
    };
    await this.stripe.products.update(product.id, {
      active: promote,
      name: definition.name,
      description: definition.description,
      metadata: {
        ...product.metadata,
        ...metadata,
        supported_markets: JSON.stringify(definition.supportedMarkets),
        features: JSON.stringify(definition.features),
      },
    });
    await this.stripe.prices.update(price.id, {
      active: promote,
      metadata: { ...price.metadata, ...metadata },
    });
    if (!promote) {
      return mapPlan(price, product);
    }
    const upgraded = await this.stripe.prices.retrieve(price.id, {
      expand: ['product'],
    });
    return mapPlan(upgraded, expandedProduct(upgraded));
  }

  async archivePlan(priceId: string): Promise<void> {
    const price = await this.requireManagedPrice(priceId);
    await this.stripe.prices.update(price.id, { active: false });
  }

  async restorePlan(priceId: string): Promise<BillingPlan> {
    const price = await this.requireManagedPrice(priceId, {
      expand: ['product'],
    });
    const product = expandedProduct(price);
    if (!product.active) {
      await this.stripe.products.update(product.id, { active: true });
    }
    if (!price.active) {
      await this.stripe.prices.update(price.id, { active: true });
    }
    const restored = await this.stripe.prices.retrieve(price.id, {
      expand: ['product'],
    });
    return mapPlan(restored, expandedProduct(restored));
  }

  async handleWebhook(payload: string, signature: string) {
    if (!this.options.webhookSecret) {
      throw new BillingServiceError(
        'STRIPE_WEBHOOK_NOT_CONFIGURED',
        503,
        'Stripe webhook signing is not configured',
      );
    }

    let event: Stripe.Event;
    try {
      event = await this.stripe.webhooks.constructEventAsync(
        payload,
        signature,
        this.options.webhookSecret,
        undefined,
        this.cryptoProvider,
      );
    } catch (error) {
      throw new BillingServiceError(
        'INVALID_STRIPE_SIGNATURE',
        400,
        'Invalid Stripe webhook signature',
        error,
      );
    }
    return normalizeWebhookEvent(event, this.stripe);
  }

  private async listPlans(): Promise<BillingPlan[]> {
    const prices = await this.stripe.prices.list({
      active: true,
      type: 'recurring',
      limit: 100,
      expand: ['data.product'],
    });
    return prices.data
      .filter(
        (price) =>
          price.recurring !== null &&
          typeof price.product !== 'string' &&
          !price.product.deleted &&
          price.product.active,
      )
      .map((price) => mapPlan(price, price.product as Stripe.Product))
      .filter((plan) => plan.analysisCredits > 0);
  }

  private async listArchivedPlans(): Promise<BillingPlan[]> {
    const prices = await this.stripe.prices.list({
      active: false,
      type: 'recurring',
      limit: 100,
      expand: ['data.product'],
    });
    return prices.data
      .filter(
        (price) =>
          price.metadata.managed_by === 'tradingagents-web' &&
          price.recurring !== null &&
          typeof price.product !== 'string' &&
          !price.product.deleted,
      )
      .map((price) => mapPlan(price, price.product as Stripe.Product))
      .filter((plan) => plan.analysisCredits > 0);
  }

  private async requireManagedPrice(
    priceId: string,
    params?: Stripe.PriceRetrieveParams,
  ): Promise<Stripe.Price> {
    const price = await this.stripe.prices.retrieve(priceId, params);
    if (price.metadata.managed_by !== 'tradingagents-web') {
      throw new BillingServiceError(
        'UNMANAGED_BILLING_PLAN',
        400,
        'Only TradingAgents-managed plans can be changed',
      );
    }
    return price;
  }
}

class UnavailableBillingService implements BillingService {
  constructor(private readonly options: StripeBillingOptions) {}

  async getOverview(): Promise<BillingOverview> {
    return {
      configured: false,
      plans: [],
      subscription: null,
      invoices: [],
    };
  }

  async getSettings(): Promise<BillingSettings> {
    return {
      configured: false,
      connectionHealthy: false,
      webhookConfigured: false,
      webhookUrl: new URL(
        '/api/stripe/webhook',
        this.options.appBaseUrl,
      ).toString(),
      mode: 'unconfigured',
      plans: [],
      archivedPlans: [],
      configurationSource: 'none',
      secretKeyHint: null,
      webhookSecretHint: null,
    };
  }

  async getAdminPeriodSummary(): Promise<AdminStripePeriodSummary | null> {
    return null;
  }

  async createCustomer(): Promise<string> {
    return this.unavailable();
  }

  async createCheckout(): Promise<string> {
    return this.unavailable();
  }

  async createPortal(): Promise<string> {
    return this.unavailable();
  }

  async createPlan(): Promise<BillingPlan> {
    return this.unavailable();
  }

  async updatePlan(): Promise<BillingPlan> {
    return this.unavailable();
  }

  async provisionDefaultPlans(): Promise<BillingPlan[]> {
    return this.unavailable();
  }

  async archivePlan(): Promise<void> {
    return this.unavailable();
  }

  async restorePlan(): Promise<BillingPlan> {
    return this.unavailable();
  }

  async handleWebhook(): Promise<StripeWebhookEvent> {
    return this.unavailable();
  }

  private unavailable(): never {
    throw new BillingServiceError(
      'BILLING_NOT_CONFIGURED',
      503,
      'Stripe billing is not configured',
    );
  }
}

function mapPlan(price: Stripe.Price, product: Stripe.Product): BillingPlan {
  if (!price.recurring || price.unit_amount === null) {
    throw new BillingServiceError(
      'INVALID_STRIPE_PRICE',
      502,
      'Stripe returned an invalid recurring price',
    );
  }
  if (!['month', 'year'].includes(price.recurring.interval)) {
    throw new BillingServiceError(
      'UNSUPPORTED_BILLING_INTERVAL',
      502,
      'Stripe returned an unsupported billing interval',
    );
  }

  return {
    id: price.id,
    catalogKey:
      price.metadata.catalog_key ?? product.metadata.catalog_key ?? null,
    name: product.name,
    description: product.description,
    unitAmount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring.interval as 'month' | 'year',
    intervalCount: price.recurring.interval_count,
    analysisCredits: metadataInteger(
      price.metadata.analysis_credits ?? product.metadata.analysis_credits,
    ),
    supportedMarkets: metadataList(product.metadata.supported_markets),
    features: metadataList(product.metadata.features),
  };
}

function expandedProduct(price: Stripe.Price): Stripe.Product {
  if (
    typeof price.product === 'string' ||
    !price.product ||
    price.product.deleted
  ) {
    throw new BillingServiceError(
      'INVALID_STRIPE_PRODUCT',
      502,
      'Stripe returned an invalid product for a subscription plan',
    );
  }
  return price.product;
}

function defaultPlanMatches(
  price: Stripe.Price,
  product: Stripe.Product,
  definition: DefaultBillingPlanDefinition,
) {
  return (
    price.unit_amount === definition.unitAmount &&
    price.currency === definition.currency &&
    price.recurring?.interval === definition.interval &&
    price.recurring.interval_count === 1 &&
    price.metadata.managed_by === 'tradingagents-web' &&
    metadataInteger(price.metadata.analysis_credits) ===
      definition.analysisCredits &&
    product.metadata.managed_by === 'tradingagents-web' &&
    product.metadata.catalog_key === definition.catalogKey &&
    metadataInteger(product.metadata.analysis_credits) ===
      definition.analysisCredits &&
    JSON.stringify(metadataList(product.metadata.supported_markets)) ===
      JSON.stringify(definition.supportedMarkets) &&
    JSON.stringify(metadataList(product.metadata.features)) ===
      JSON.stringify(definition.features)
  );
}

function defaultPlanTermsMatch(
  price: Stripe.Price,
  product: Stripe.Product,
  definition: DefaultBillingPlanDefinition,
) {
  return (
    price.unit_amount === definition.unitAmount &&
    price.currency === definition.currency &&
    price.recurring?.interval === definition.interval &&
    price.recurring.interval_count === 1 &&
    price.metadata.managed_by === 'tradingagents-web' &&
    product.metadata.managed_by === 'tradingagents-web'
  );
}

/** Exported for unit tests; production path is `handleWebhook`. */
export async function normalizeWebhookEvent(
  event: Stripe.Event,
  stripe: Stripe,
): Promise<StripeWebhookEvent> {
  const normalized: StripeWebhookEvent = {
    id: event.id,
    type: event.type,
    payload: { stripeCreatedAt: event.created, livemode: event.livemode },
  };
  if (event.type.startsWith('customer.subscription.')) {
    const subscription = event.data.object as Stripe.Subscription;
    const snapshot = subscriptionSnapshot(subscription);
    normalized.subscription = snapshot;
    if (
      event.type === 'customer.subscription.deleted' ||
      snapshot.status === 'canceled' ||
      snapshot.status === 'unpaid'
    ) {
      normalized.expirePeriod = true;
    }
    // Portal plan switches may update the subscription without an immediate
    // invoice.paid (no proration). Grant upgrade deltas from price changes.
    if (
      event.type === 'customer.subscription.updated' &&
      subscriptionItemsChanged(event) &&
      (snapshot.status === 'active' || snapshot.status === 'trialing')
    ) {
      const creditGrant = await upgradeCreditGrantFromSubscription(
        subscription,
        snapshot,
        stripe,
      );
      if (creditGrant) normalized.creditGrant = creditGrant;
    }
    return normalized;
  }

  if (
    event.type === 'charge.refunded' ||
    event.type === 'charge.refund.updated'
  ) {
    const charge = event.data.object as StripeChargeLike;
    const customerId = objectId(charge.customer);
    if (!customerId || charge.amount_refunded <= 0) return normalized;
    normalized.creditClawback = {
      chargeId: charge.id,
      customerId,
      invoiceId: objectId(charge.invoice),
      amountRefunded: charge.amount_refunded,
      amountPaid: charge.amount,
      reason: 'refund',
    };
    return normalized;
  }

  if (
    event.type === 'charge.dispute.funds_withdrawn' ||
    (event.type === 'charge.dispute.closed' &&
      (event.data.object as Stripe.Dispute).status === 'lost')
  ) {
    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = objectId(dispute.charge);
    if (!chargeId) return normalized;
    const charge = (await stripe.charges.retrieve(
      chargeId,
    )) as unknown as StripeChargeLike;
    const customerId = objectId(charge.customer);
    if (!customerId) return normalized;
    normalized.creditClawback = {
      chargeId: charge.id,
      customerId,
      invoiceId: objectId(charge.invoice),
      amountRefunded: charge.amount,
      amountPaid: charge.amount,
      reason: 'dispute',
    };
    return normalized;
  }

  if (event.type !== 'invoice.paid') return normalized;

  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = invoiceSubscriptionId(invoice);
  const customerId = objectId(invoice.customer);
  if (!subscriptionId || !customerId) return normalized;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  });
  const snapshot = subscriptionSnapshot(subscription);
  normalized.subscription = snapshot;
  const item = subscription.items.data[0];
  const product = item?.price.product;
  const credits = metadataInteger(
    item?.price.metadata.analysis_credits ??
      (product && typeof product !== 'string' && !product.deleted
        ? product.metadata.analysis_credits
        : undefined),
  );
  if (
    credits <= 0 ||
    (subscription.status !== 'active' && subscription.status !== 'trialing')
  ) {
    return normalized;
  }

  const reason = invoice.billing_reason;
  if (reason === 'subscription_create') {
    normalized.creditGrant = {
      invoiceId: invoice.id,
      customerId,
      subscriptionId,
      priceId: item?.price.id ?? '',
      credits,
      grantKind: 'create',
      expireBeforeGrant: false,
      periodStart: snapshot.currentPeriodStart,
      periodEnd: snapshot.currentPeriodEnd,
    };
  } else if (reason === 'subscription_cycle') {
    normalized.creditGrant = {
      invoiceId: invoice.id,
      customerId,
      subscriptionId,
      priceId: item?.price.id ?? '',
      credits,
      grantKind: 'cycle',
      expireBeforeGrant: true,
      periodStart: snapshot.currentPeriodStart,
      periodEnd: snapshot.currentPeriodEnd,
    };
  } else if (reason === 'subscription_update') {
    normalized.creditGrant = {
      invoiceId: invoice.id,
      customerId,
      subscriptionId,
      priceId: item?.price.id ?? '',
      credits,
      grantKind: 'upgrade_delta',
      expireBeforeGrant: false,
      periodStart: snapshot.currentPeriodStart,
      periodEnd: snapshot.currentPeriodEnd,
    };
  }
  return normalized;
}

function isScheduledToCancel(subscription: Stripe.Subscription): boolean {
  // Billing Portal / newer Stripe flows may set `cancel_at` without
  // flipping `cancel_at_period_end`.
  return (
    subscription.cancel_at_period_end === true ||
    (typeof subscription.cancel_at === 'number' && subscription.cancel_at > 0)
  );
}

function subscriptionItemsChanged(event: Stripe.Event): boolean {
  const previous = (
    event.data as Stripe.Event.Data & {
      previous_attributes?: { items?: unknown };
    }
  ).previous_attributes;
  return previous != null && Object.prototype.hasOwnProperty.call(previous, 'items');
}

async function upgradeCreditGrantFromSubscription(
  subscription: Stripe.Subscription,
  snapshot: StripeSubscriptionSnapshot,
  stripe: Stripe,
): Promise<StripeWebhookEvent['creditGrant'] | null> {
  const customerId = snapshot.customerId;
  const priceId = snapshot.priceId;
  if (!customerId || !priceId) return null;

  const item = subscription.items.data[0];
  let credits = 0;
  if (item?.price && typeof item.price !== 'string') {
    credits = metadataInteger(item.price.metadata?.analysis_credits);
  }
  if (credits <= 0) {
    const price = await stripe.prices.retrieve(priceId, {
      expand: ['product'],
    });
    const product = price.product;
    credits = metadataInteger(
      price.metadata.analysis_credits ??
        (product && typeof product !== 'string' && !product.deleted
          ? product.metadata.analysis_credits
          : undefined),
    );
  }
  if (credits <= 0) return null;

  // Stable across webhook retries; invoice.paid upgrade_delta stays safe via
  // periodBaselineCredits (grant amount collapses to 0 after this applies).
  const periodEnd = snapshot.currentPeriodEnd ?? 0;
  return {
    invoiceId: `subupd:${snapshot.id}:${priceId}:${periodEnd}`,
    customerId,
    subscriptionId: snapshot.id,
    priceId,
    credits,
    grantKind: 'upgrade_delta',
    expireBeforeGrant: false,
    periodStart: snapshot.currentPeriodStart,
    periodEnd: snapshot.currentPeriodEnd,
  };
}

function subscriptionSnapshot(
  subscription: Stripe.Subscription,
): StripeSubscriptionSnapshot {
  const item = subscription.items.data[0];
  return {
    id: subscription.id,
    customerId: objectId(subscription.customer) ?? '',
    priceId: item?.price.id ?? '',
    status: subscription.status as StripeSubscriptionSnapshot['status'],
    cancelAtPeriodEnd: isScheduledToCancel(subscription),
    currentPeriodStart: item?.current_period_start ?? null,
    currentPeriodEnd:
      item?.current_period_end ?? subscription.cancel_at ?? null,
    latestInvoiceId: objectId(subscription.latest_invoice),
  };
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const value = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
    parent?: {
      type?: string;
      subscription_details?: {
        subscription?: string | Stripe.Subscription | null;
      } | null;
    } | null;
  };
  return objectId(
    value.subscription ?? value.parent?.subscription_details?.subscription,
  );
}

type StripeChargeLike = {
  id: string;
  customer?: string | { id: string } | null;
  invoice?: string | { id: string } | null;
  amount: number;
  amount_refunded: number;
};

function objectId(value: { id: string } | string | null | undefined) {
  return typeof value === 'string' ? value : (value?.id ?? null);
}

function metadataInteger(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function metadataList(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function mapSubscription(
  subscription: Stripe.Subscription,
  knownPlanName?: string,
): BillingSubscription {
  const item = subscription.items.data[0];
  const product = item?.price.product;
  const planName =
    product && typeof product !== 'string' && !product.deleted
      ? product.name
      : (knownPlanName ?? 'Subscription');

  return {
    id: subscription.id,
    status: subscription.status,
    planName,
    priceId: item?.price.id ?? '',
    cancelAtPeriodEnd: isScheduledToCancel(subscription),
    currentPeriodEnd:
      item?.current_period_end ?? subscription.cancel_at ?? null,
  };
}

function mapInvoice(invoice: Stripe.Invoice): BillingInvoice {
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    amountDue: invoice.amount_due,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
    createdAt: invoice.created,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
  };
}

function isMissingStripeCustomer(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    code?: string;
    param?: string;
    message?: string;
  };
  if (candidate.code !== 'resource_missing') return false;
  if (candidate.param === 'customer') return true;
  return (
    typeof candidate.message === 'string' &&
    candidate.message.toLowerCase().includes('no such customer')
  );
}

function secretHint(value: string | undefined) {
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
