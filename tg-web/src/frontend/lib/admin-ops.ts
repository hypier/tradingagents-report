type FetchImplementation = typeof fetch;

export type SystemSettings = Record<string, Record<string, unknown>>;

export type AdminMarket = {
  code: string;
  enabled: boolean | number;
  displayName: string;
  timezone: string;
  currency: string;
  sessionNotes: string | null;
  disclaimer: string | null;
  sortOrder: number;
  updatedAt?: string | Date;
};

export type DatasourceHealth = {
  dependencies: Array<{
    id: string;
    ok: boolean;
    error: string | null;
  }>;
  vendors: Array<{
    id: string;
    label: string;
    status: string;
    errors?: Array<{
      sourceUrl?: string;
      providerId?: string;
      error: string | null;
    }>;
  }>;
};

export type AuditEvent = {
  id: string;
  actorClerkUserId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string | Date;
};

export type AuditQuery = {
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

async function read<T>(
  path: string,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(path);
  if (!response.ok) throw new Error('Unable to load admin ops data');
  return response.json() as Promise<{ data: T; requestId: string }>;
}

async function send<T>(
  path: string,
  options: {
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
  },
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
    throw new Error(payload?.error?.message ?? 'Unable to update admin ops data');
  }
  return response.json() as Promise<{ data: T; requestId: string }>;
}

export const getAdminSettings = (fetchImplementation?: FetchImplementation) =>
  read<SystemSettings>('/api/admin/settings', fetchImplementation);

export const updateAdminSettings = (
  patch: Record<string, unknown>,
  fetchImplementation?: FetchImplementation,
) =>
  send<SystemSettings>(
    '/api/admin/settings',
    { method: 'PATCH', body: patch },
    fetchImplementation,
  );

export const listAdminMarkets = (fetchImplementation?: FetchImplementation) =>
  read<AdminMarket[]>('/api/admin/markets', fetchImplementation);

export const upsertAdminMarket = (
  code: string,
  input: Omit<AdminMarket, 'code' | 'updatedAt'> & { code?: string },
  fetchImplementation?: FetchImplementation,
) =>
  send<AdminMarket>(
    `/api/admin/markets/${encodeURIComponent(code)}`,
    {
      method: 'PUT',
      body: { ...input, code },
    },
    fetchImplementation,
  );

export const getAdminDatasources = (
  fetchImplementation?: FetchImplementation,
) => read<DatasourceHealth>('/api/admin/datasources', fetchImplementation);

export const listAdminAudit = (
  query: AuditQuery = {},
  fetchImplementation?: FetchImplementation,
) => {
  const params = new URLSearchParams();
  if (query.action) params.set('action', query.action);
  if (query.actor) params.set('actor', query.actor);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.limit != null) params.set('limit', String(query.limit));
  if (query.offset != null) params.set('offset', String(query.offset));
  const qs = params.toString();
  return read<AuditEvent[]>(
    `/api/admin/audit${qs ? `?${qs}` : ''}`,
    fetchImplementation,
  );
};
