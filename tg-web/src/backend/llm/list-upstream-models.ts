/**
 * List upstream model IDs from a provider's `/models` endpoint.
 * Supports OpenAI-compatible and Anthropic list payloads.
 */

import { defaultBackendUrlForDriver } from './provider-connection-test';

export type UpstreamModelsResult =
  | { ok: true; models: string[] }
  | { ok: false; error: string };

function resolveBaseUrl(
  driver: string,
  backendUrl: string | null | undefined,
): string | null {
  const trimmed = backendUrl?.trim();
  if (trimmed) return trimmed.replace(/\/$/, '');
  return defaultBackendUrlForDriver(driver);
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

function extractModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as { data?: unknown; models?: unknown };
  const rows = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : [];
  const ids = new Set<string>();
  for (const row of rows) {
    if (typeof row === 'string' && row.trim()) {
      ids.add(row.trim());
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const id = (row as { id?: unknown }).id;
    if (typeof id === 'string' && id.trim()) {
      ids.add(id.trim());
    }
  }
  return Array.from(ids).sort((a, b) => a.localeCompare(b));
}

export async function listUpstreamModels(input: {
  driver: string;
  apiKey: string | null;
  backendUrl: string | null;
}): Promise<UpstreamModelsResult> {
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
    const headers: Record<string, string> = {};
    if (input.driver === 'anthropic') {
      headers['x-api-key'] = input.apiKey!.trim();
      headers['anthropic-version'] = '2023-06-01';
    } else if (input.apiKey?.trim()) {
      headers.Authorization = `Bearer ${input.apiKey.trim()}`;
    }

    const response = await fetch(`${base}/models`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return { ok: false, error: await readErrorBody(response) };
    }
    const payload = await response.json().catch(() => null);
    return { ok: true, models: extractModelIds(payload) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
