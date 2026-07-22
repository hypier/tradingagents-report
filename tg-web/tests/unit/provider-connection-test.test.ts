import { describe, expect, it, vi } from 'vitest';

import { testProviderConnection } from '../../src/backend/llm/provider-connection-test';

describe('testProviderConnection', () => {
  it('requires backend url for openai_compatible', async () => {
    const result = await testProviderConnection({
      driver: 'openai_compatible',
      apiKey: 'sk-test',
      backendUrl: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Backend URL/i);
    }
  });

  it('calls OpenAI-compatible /models with bearer key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'gpt-test' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testProviderConnection({
      driver: 'openai',
      apiKey: 'sk-test',
      backendUrl: null,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk-test' },
      }),
    );
    if (result.ok) {
      expect(result.modelCount).toBe(1);
    }

    vi.unstubAllGlobals();
  });
});
