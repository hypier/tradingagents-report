type FetchImplementation = typeof fetch;

export type AdminLlmProvider = {
  id: string;
  displayName: string;
  enabled: boolean;
  backendUrl: string | null;
  apiKeyHint: string | null;
  hasApiKey: boolean;
  sortOrder: number;
  notes: string | null;
};

export type AdminLlmModel = {
  id: string;
  providerId: string;
  model: string;
  displayName: string;
  role: 'quick' | 'deep' | 'both' | string;
  enabled: boolean;
  currency: string;
  unitTokens: number;
  inputPrice: string | number | null;
  outputPrice: string | number | null;
  cachedInputPrice: string | number | null;
  cacheWritePrice: string | number | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  syncedAt: string | Date | null;
  syncError: string | null;
};

export type LlmDefaults = {
  defaultQuickModelId: string | null;
  defaultDeepModelId: string | null;
};

async function read<T>(
  path: string,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(path);
  if (!response.ok) throw new Error('Unable to load LLM admin data');
  return response.json() as Promise<{ data: T; requestId: string }>;
}

async function send<T>(
  path: string,
  options: { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown },
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(path, {
    method: options.method,
    headers: options.body
      ? { 'Content-Type': 'application/json' }
      : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message ?? 'Unable to update LLM admin data');
  }
  return response.json() as Promise<{ data: T; requestId: string }>;
}

export const listAdminLlmProviders = (fetchImplementation?: FetchImplementation) =>
  read<{ providers: AdminLlmProvider[]; availableIds: string[] }>(
    '/api/admin/llm/providers',
    fetchImplementation,
  );

export const upsertAdminLlmProvider = (
  id: string,
  body: {
    displayName: string;
    enabled: boolean;
    backendUrl?: string | null;
    apiKey?: string;
    sortOrder?: number;
    notes?: string | null;
  },
  fetchImplementation?: FetchImplementation,
) =>
  send<AdminLlmProvider>(
    `/api/admin/llm/providers/${encodeURIComponent(id)}`,
    { method: 'PUT', body },
    fetchImplementation,
  );

export const clearAdminLlmProviderApiKey = (
  id: string,
  fetchImplementation?: FetchImplementation,
) =>
  send<AdminLlmProvider>(
    `/api/admin/llm/providers/${encodeURIComponent(id)}/api-key`,
    { method: 'DELETE' },
    fetchImplementation,
  );

export const deleteAdminLlmProvider = (
  id: string,
  fetchImplementation?: FetchImplementation,
) =>
  send<{ id: string }>(
    `/api/admin/llm/providers/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    fetchImplementation,
  );

export const listAdminLlmModels = (fetchImplementation?: FetchImplementation) =>
  read<{ models: AdminLlmModel[]; defaults: LlmDefaults }>(
    '/api/admin/llm/models',
    fetchImplementation,
  );

export const createAdminLlmModel = (
  body: Record<string, unknown>,
  fetchImplementation?: FetchImplementation,
) =>
  send<AdminLlmModel>(
    '/api/admin/llm/models',
    { method: 'POST', body },
    fetchImplementation,
  );

export const updateAdminLlmModel = (
  id: string,
  body: Record<string, unknown>,
  fetchImplementation?: FetchImplementation,
) =>
  send<AdminLlmModel>(
    `/api/admin/llm/models/${encodeURIComponent(id)}`,
    { method: 'PATCH', body },
    fetchImplementation,
  );

export const deleteAdminLlmModel = (
  id: string,
  fetchImplementation?: FetchImplementation,
) =>
  send<{ id: string }>(
    `/api/admin/llm/models/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    fetchImplementation,
  );

export const syncAdminLlmModel = (
  id: string,
  fetchImplementation?: FetchImplementation,
) =>
  send<AdminLlmModel>(
    `/api/admin/llm/models/${encodeURIComponent(id)}/sync`,
    { method: 'POST' },
    fetchImplementation,
  );

export const syncPreviewAdminLlmModel = (
  body: { providerId: string; model: string },
  fetchImplementation?: FetchImplementation,
) =>
  send<Record<string, unknown>>(
    '/api/admin/llm/models/sync-preview',
    { method: 'POST', body },
    fetchImplementation,
  );

export const setAdminLlmDefaults = (
  body: { defaultQuickModelId: string; defaultDeepModelId: string },
  fetchImplementation?: FetchImplementation,
) =>
  send<LlmDefaults>(
    '/api/admin/llm/defaults',
    { method: 'PUT', body },
    fetchImplementation,
  );
