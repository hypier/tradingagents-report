import type { BillingConfigRepository } from '../database/repositories';

export type StripeSecretConfiguration = {
  secretKey: string;
  webhookSecret: string;
  updatedAt: Date | null;
};

export interface BillingConfigurationStore {
  readonly editable: boolean;
  load(): Promise<StripeSecretConfiguration | null>;
  save(input: {
    secretKey: string;
    webhookSecret: string;
    actorClerkUserId: string;
  }): Promise<void>;
  clear(actorClerkUserId: string): Promise<void>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const cipherVersion = 'v1';

export function createBillingConfigurationStore(
  repository: BillingConfigRepository,
  encodedMasterKey?: string,
): BillingConfigurationStore {
  if (!encodedMasterKey) {
    return {
      editable: false,
      async load() {
        return null;
      },
      async save() {
        throw new Error('Billing configuration encryption is not configured');
      },
      async clear() {
        throw new Error('Billing configuration encryption is not configured');
      },
    };
  }

  const key = importMasterKey(encodedMasterKey);
  return {
    editable: true,
    async load() {
      const stored = await repository.getStripe();
      if (!stored) return null;
      return {
        secretKey: await decrypt(
          stored.secretKeyCiphertext,
          'stripe-secret-key',
          key,
        ),
        webhookSecret: await decrypt(
          stored.webhookSecretCiphertext,
          'stripe-webhook-secret',
          key,
        ),
        updatedAt: stored.updatedAt,
      };
    },
    async save(input) {
      const [secretKeyCiphertext, webhookSecretCiphertext] = await Promise.all([
        encrypt(input.secretKey, 'stripe-secret-key', key),
        encrypt(input.webhookSecret, 'stripe-webhook-secret', key),
      ]);
      await repository.setStripe({
        secretKeyCiphertext,
        webhookSecretCiphertext,
        actorClerkUserId: input.actorClerkUserId,
      });
    },
    clear(actorClerkUserId) {
      return repository.clearStripe(actorClerkUserId);
    },
  };
}

export function isValidBillingEncryptionKey(value: string): boolean {
  try {
    return decodeBase64(value).byteLength === 32;
  } catch {
    return false;
  }
}

async function importMasterKey(encodedMasterKey: string) {
  const bytes = decodeBase64(encodedMasterKey);
  if (bytes.byteLength !== 32) {
    throw new Error(
      'BILLING_CONFIG_ENCRYPTION_KEY must be a Base64-encoded 32-byte key',
    );
  }
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

async function encrypt(
  plaintext: string,
  context: string,
  key: Promise<CryptoKey>,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: encoder.encode(context),
    },
    await key,
    encoder.encode(plaintext),
  );
  return [cipherVersion, encodeBase64(iv), encodeBase64(ciphertext)].join('.');
}

async function decrypt(
  value: string,
  context: string,
  key: Promise<CryptoKey>,
) {
  const [version, encodedIv, encodedCiphertext] = value.split('.');
  if (version !== cipherVersion || !encodedIv || !encodedCiphertext) {
    throw new Error('Unsupported encrypted billing configuration');
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: decodeBase64(encodedIv),
      additionalData: encoder.encode(context),
    },
    await key,
    decodeBase64(encodedCiphertext),
  );
  return decoder.decode(plaintext);
}

function encodeBase64(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
