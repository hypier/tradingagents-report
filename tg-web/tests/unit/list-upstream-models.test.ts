import { describe, expect, it, vi } from 'vitest';

import { listUpstreamModels } from '../../src/backend/llm/list-upstream-models';

describe('listUpstreamModels', () => {
  it('parses OpenAI-compatible model ids', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'gpt-5.5' }, { id: 'gpt-4.1' }, { id: 'gpt-5.5' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listUpstreamModels({
      driver: 'openai',
      apiKey: 'sk-test',
      backendUrl: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.models).toEqual(['gpt-4.1', 'gpt-5.5']);
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk-test' },
      }),
    );

    vi.unstubAllGlobals();
  });

  it('requires backend url for openai_compatible', async () => {
    const result = await listUpstreamModels({
      driver: 'openai_compatible',
      apiKey: 'sk-test',
      backendUrl: null,
    });
    expect(result.ok).toBe(false);
  });
});
