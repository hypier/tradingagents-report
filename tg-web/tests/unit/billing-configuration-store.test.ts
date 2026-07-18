import { describe, expect, it, vi } from 'vitest';

import { createBillingConfigurationStore } from '../../src/backend/billing/configuration-store';
import { createManagedStripeBillingService } from '../../src/backend/billing/managed-stripe-billing';
import type { BillingConfigRepository } from '../../src/backend/database/repositories';

const masterKey = btoa(
  String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index)),
);
const replacementKey = btoa(
  String.fromCharCode(...Array.from({ length: 32 }, (_, index) => 255 - index)),
);

describe('billing configuration store', () => {
  it('encrypts Stripe secrets before persistence and decrypts them on load', async () => {
    let stored: Awaited<ReturnType<BillingConfigRepository['getStripe']>>;
    const repository: BillingConfigRepository = {
      getStripe: vi.fn(async () => stored),
      setStripe: vi.fn(async (input) => {
        stored = {
          provider: 'stripe',
          secretKeyCiphertext: input.secretKeyCiphertext,
          webhookSecretCiphertext: input.webhookSecretCiphertext,
          updatedByClerkUserId: input.actorClerkUserId,
          createdAt: new Date(0),
          updatedAt: new Date(1_000),
        };
      }),
      clearStripe: vi.fn(),
    };
    const store = createBillingConfigurationStore(repository, masterKey);

    await store.save({
      secretKey: 'sk_test_1234567890abcdef',
      webhookSecret: 'whsec_1234567890abcdef',
      actorClerkUserId: 'admin-1',
    });

    expect(stored?.secretKeyCiphertext).not.toContain(
      'sk_test_1234567890abcdef',
    );
    expect(stored?.webhookSecretCiphertext).not.toContain(
      'whsec_1234567890abcdef',
    );
    await expect(store.load()).resolves.toEqual({
      secretKey: 'sk_test_1234567890abcdef',
      webhookSecret: 'whsec_1234567890abcdef',
      updatedAt: new Date(1_000),
    });
  });

  it('does not expose editing without a deployment encryption key', async () => {
    const repository = {
      getStripe: vi.fn(),
      setStripe: vi.fn(),
      clearStripe: vi.fn(),
    } satisfies BillingConfigRepository;
    const store = createBillingConfigurationStore(repository);

    expect(store.editable).toBe(false);
    await expect(store.load()).resolves.toBeNull();
    await expect(
      store.save({
        secretKey: 'sk_test_secret',
        webhookSecret: 'whsec_secret',
        actorClerkUserId: 'admin-1',
      }),
    ).rejects.toThrow('encryption is not configured');
    expect(repository.setStripe).not.toHaveBeenCalled();
  });

  it('keeps settings recoverable when the deployment key cannot decrypt stored values', async () => {
    let stored: Awaited<ReturnType<BillingConfigRepository['getStripe']>>;
    const repository: BillingConfigRepository = {
      getStripe: vi.fn(async () => stored),
      setStripe: vi.fn(async (input) => {
        stored = {
          provider: 'stripe',
          secretKeyCiphertext: input.secretKeyCiphertext,
          webhookSecretCiphertext: input.webhookSecretCiphertext,
          updatedByClerkUserId: input.actorClerkUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }),
      clearStripe: vi.fn(),
    };
    await createBillingConfigurationStore(repository, masterKey).save({
      secretKey: 'sk_test_1234567890abcdef',
      webhookSecret: 'whsec_1234567890abcdef',
      actorClerkUserId: 'admin-1',
    });
    const service = createManagedStripeBillingService({
      appBaseUrl: new URL('https://app.example.test'),
      configurationStore: createBillingConfigurationStore(
        repository,
        replacementKey,
      ),
    });

    await expect(service.getSettings()).resolves.toMatchObject({
      configured: true,
      connectionHealthy: false,
      configurationSource: 'database',
      configurationEditable: true,
    });
    await service.clearConfiguration('admin-2');
    expect(repository.clearStripe).toHaveBeenCalledWith('admin-2');
  });
});
