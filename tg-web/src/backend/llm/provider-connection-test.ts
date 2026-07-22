/**
 * Probe whether provider API key + backend URL can reach an upstream models endpoint.
 * Supports OpenAI-compatible `/v1/models` and Anthropic `/v1/models`.
 */

export type ProviderConnectionTestResult =
  | { ok: true; message: string; modelCount: number | null }
  | { ok: false; error: string };

const DEFAULT_BACKEND_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  deepseek: 'https://api.deepseek.com/v1',
  xai: 'https://api.x.ai/v1',
  mistral: 'https://api.mistral.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  kimi: 'https://api.moonshot.ai/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  ollama: 'http://127.0.0.1:11434/v1',
  qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  'qwen-cn': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  glm: 'https://api.z.ai/api/paas/v4',
  'glm-cn': 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.io/v1',
  'minimax-cn': 'https://api.minimaxi.com/v1',
};

function resolveBaseUrl(
  driver: string,
  backendUrl: string | null | undefined,
): string | null {
  const trimmed = backendUrl?.trim();
  if (trimmed) return trimmed.replace(/\/$/, '');
  const fallback = DEFAULT_BACKEND_URLS[driver];
  return fallback ?? null;
}

async function readErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `HTTP ${response.status}`;
  try {
    const json = JSON.parse(text) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof json.error === 'string') return json.error;
    if (json.error && typeof json.error === 'object' && json.error.message) {
      return json.error.message;
    }
    if (typeof json.message === 'string') return json.message;
  } catch {
    // keep raw text
  }
  return text.slice(0, 240);
}

function countModelsPayload(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { data?: unknown; models?: unknown };
  if (Array.isArray(record.data)) return record.data.length;
  if (Array.isArray(record.models)) return record.models.length;
  return null;
}

export async function testProviderConnection(input: {
  driver: string;
  apiKey: string | null;
  backendUrl: string | null;
}): Promise<ProviderConnectionTestResult> {
  const base = resolveBaseUrl(input.driver, input.backendUrl);
  if (!base) {
    return {
      ok: false,
      error: 'Backend URL is required for this provider',
    };
  }

  const needsKey = input.driver !== 'ollama';
  if (needsKey && !input.apiKey?.trim()) {
    return { ok: false, error: 'API key is required' };
  }

  try {
    if (input.driver === 'anthropic') {
      const response = await fetch(`${base}/models`, {
        headers: {
          'x-api-key': input.apiKey!.trim(),
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        return {
          ok: false,
          error: await readErrorBody(response),
        };
      }
      const payload = await response.json().catch(() => null);
      const modelCount = countModelsPayload(payload);
      return {
        ok: true,
        message: 'Anthropic API reachable',
        modelCount,
      };
    }

    const headers: Record<string, string> = {};
    if (input.apiKey?.trim()) {
      headers.Authorization = `Bearer ${input.apiKey.trim()}`;
    }
    const response = await fetch(`${base}/models`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: await readErrorBody(response),
      };
    }
    const payload = await response.json().catch(() => null);
    const modelCount = countModelsPayload(payload);
    return {
      ok: true,
      message: 'Provider API reachable',
      modelCount,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function defaultBackendUrlForDriver(driver: string): string | null {
  return DEFAULT_BACKEND_URLS[driver] ?? null;
}

/** @deprecated Use defaultBackendUrlForDriver */
export function defaultBackendUrlForProvider(providerId: string): string | null {
  return defaultBackendUrlForDriver(providerId);
}
