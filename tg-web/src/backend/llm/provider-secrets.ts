import {
  decryptSecret,
  encryptSecret,
  importSecretBoxMasterKey,
  isValidSecretBoxMasterKey,
  maskSecretHint,
} from '../security/secret-box';

export const LLM_API_KEY_AAD = 'llm-provider-api-key';

export function isValidLlmEncryptionKey(value: string): boolean {
  return isValidSecretBoxMasterKey(value);
}

export type LlmProviderSecrets = {
  readonly configured: boolean;
  encrypt(apiKey: string): Promise<{ ciphertext: string; hint: string }>;
  decrypt(ciphertext: string): Promise<string>;
};

export function createLlmProviderSecrets(
  encodedMasterKey?: string,
): LlmProviderSecrets {
  if (!encodedMasterKey) {
    return {
      configured: false,
      async encrypt() {
        throw new Error('LLM API key encryption is not configured');
      },
      async decrypt() {
        throw new Error('LLM API key encryption is not configured');
      },
    };
  }

  const key = importSecretBoxMasterKey(encodedMasterKey);
  return {
    configured: true,
    async encrypt(apiKey) {
      const plaintext = apiKey.trim();
      if (!plaintext) {
        throw new Error('API key must not be empty');
      }
      return {
        ciphertext: await encryptSecret(plaintext, LLM_API_KEY_AAD, key),
        hint: maskSecretHint(plaintext),
      };
    },
    decrypt(ciphertext) {
      return decryptSecret(ciphertext, LLM_API_KEY_AAD, key);
    },
  };
}
