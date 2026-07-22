/**
 * 管理员手动同步：按提供商 API / models.dev 拉取单模型价格与参数。
 * 非后台工人；失败时返回 error，由调用方写入 sync_error。
 */

import { modelsDevProviderId } from '../../shared/llm-provider-logos';

export type SyncedModelFields = {
  displayName?: string;
  inputPrice?: string | null;
  outputPrice?: string | null;
  cachedInputPrice?: string | null;
  cacheWritePrice?: string | null;
  currency?: string;
  unitTokens?: number;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  params?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
};

export type ModelSyncResult =
  | { ok: true; fields: SyncedModelFields }
  | { ok: false; error: string };

type SyncInput = {
  /** Core factory / protocol type (not catalog instance id). */
  driver: string;
  model: string;
  apiKey: string | null;
  backendUrl: string | null;
};

export async function syncModelFromUpstream(
  input: SyncInput,
): Promise<ModelSyncResult> {
  try {
    if (input.driver === 'openrouter') {
      const fromProvider = await syncOpenRouter(input);
      if (fromProvider.ok) return fromProvider;
    }

    const fromModelsDev = await syncFromModelsDev(input);
    if (fromModelsDev.ok) return fromModelsDev;

    if (
      input.backendUrl ||
      input.driver === 'openai' ||
      input.driver === 'openai_compatible'
    ) {
      const fromOpenAi = await syncOpenAiCompatible(input);
      if (fromOpenAi.ok) return fromOpenAi;
    }

    return {
      ok: false,
      error:
        'Unable to sync model metadata from provider API or models.dev',
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function syncOpenRouter(input: SyncInput): Promise<ModelSyncResult> {
  if (!input.apiKey) {
    return { ok: false, error: 'OpenRouter API key is required to sync' };
  }
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${input.apiKey}` },
  });
  if (!response.ok) {
    return {
      ok: false,
      error: `OpenRouter models API returned ${response.status}`,
    };
  }
  const payload = (await response.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      context_length?: number;
      pricing?: { prompt?: string; completion?: string };
    }>;
  };
  const row = (payload.data ?? []).find((item) => item.id === input.model);
  if (!row) {
    return { ok: false, error: `Model ${input.model} not found on OpenRouter` };
  }
  const prompt = row.pricing?.prompt != null ? Number(row.pricing.prompt) : NaN;
  const completion =
    row.pricing?.completion != null ? Number(row.pricing.completion) : NaN;
  // OpenRouter pricing is USD per token; convert to per 1M tokens.
  return {
    ok: true,
    fields: {
      displayName: row.name || input.model,
      contextWindow: row.context_length ?? null,
      unitTokens: 1_000_000,
      currency: 'USD',
      inputPrice: Number.isFinite(prompt)
        ? (prompt * 1_000_000).toFixed(8)
        : null,
      outputPrice: Number.isFinite(completion)
        ? (completion * 1_000_000).toFixed(8)
        : null,
      capabilities: { source: 'openrouter' },
    },
  };
}

async function syncOpenAiCompatible(
  input: SyncInput,
): Promise<ModelSyncResult> {
  const base = (input.backendUrl || 'https://api.openai.com/v1').replace(
    /\/$/,
    '',
  );
  const url = `${base}/models/${encodeURIComponent(input.model)}`;
  const headers: Record<string, string> = {};
  if (input.apiKey) headers.Authorization = `Bearer ${input.apiKey}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    return {
      ok: false,
      error: `Provider models API returned ${response.status}`,
    };
  }
  const payload = (await response.json()) as {
    id?: string;
    owned_by?: string;
  };
  return {
    ok: true,
    fields: {
      displayName: payload.id || input.model,
      capabilities: {
        source: 'provider_api',
        ownedBy: payload.owned_by ?? null,
      },
    },
  };
}

async function syncFromModelsDev(input: SyncInput): Promise<ModelSyncResult> {
  const response = await fetch('https://models.dev/api.json');
  if (!response.ok) {
    return { ok: false, error: `models.dev returned ${response.status}` };
  }
  const payload = (await response.json()) as Record<
    string,
    {
      models?: Record<
        string,
        {
          name?: string;
          cost?: { input?: number; output?: number; cache_read?: number };
          limit?: { context?: number; output?: number };
        }
      >;
    }
  >;

  const alias = modelsDevProviderId(input.driver);
  const candidates = Array.from(new Set([alias, input.driver]));
  for (const providerKey of candidates) {
    const provider = payload[providerKey];
    const model = provider?.models?.[input.model];
    if (!model) continue;
    return {
      ok: true,
      fields: {
        displayName: model.name || input.model,
        currency: 'USD',
        unitTokens: 1_000_000,
        inputPrice:
          model.cost?.input != null ? String(model.cost.input) : null,
        outputPrice:
          model.cost?.output != null ? String(model.cost.output) : null,
        cachedInputPrice:
          model.cost?.cache_read != null
            ? String(model.cost.cache_read)
            : null,
        contextWindow: model.limit?.context ?? null,
        maxOutputTokens: model.limit?.output ?? null,
        capabilities: { source: 'models.dev', provider: providerKey },
      },
    };
  }

  return {
    ok: false,
    error: `Model ${input.driver}/${input.model} not found on models.dev`,
  };
}
