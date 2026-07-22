import { describe, expect, it } from 'vitest';

import {
  isLlmProviderId,
  isLlmProviderInstanceId,
  providerRequiresBaseUrl,
} from '../../src/shared/llm-providers';

describe('llm provider catalog ids', () => {
  it('accepts slug instance ids independent of driver whitelist', () => {
    expect(isLlmProviderInstanceId('nbapi')).toBe(true);
    expect(isLlmProviderInstanceId('openai-prod')).toBe(true);
    expect(isLlmProviderInstanceId('openai_compatible')).toBe(true);
    expect(isLlmProviderInstanceId('OpenAI')).toBe(false);
    expect(isLlmProviderInstanceId('1bad')).toBe(false);
  });

  it('keeps driver whitelist and base-url rule', () => {
    expect(isLlmProviderId('openai')).toBe(true);
    expect(isLlmProviderId('nbapi')).toBe(false);
    expect(providerRequiresBaseUrl('openai_compatible')).toBe(true);
    expect(providerRequiresBaseUrl('openai')).toBe(false);
  });
});
