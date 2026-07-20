import type {
  AuthUser,
  ManagedUser,
  ManagedUserPage,
  UserRole,
} from '@/backend/auth/contract';
import type { CreditUsage } from '@/backend/database/billing-repository';
import type { AdminOverviewMetrics } from '@/backend/database/repositories';

type FetchImplementation = typeof fetch;

export type AuthSessionData = {
  authenticated: true;
  session: { id: string };
  user: AuthUser;
};

export type AdminOverview = AdminOverviewMetrics & {
  stripe: {
    configured: boolean;
    connectionHealthy: boolean | null;
    mode: string | null;
  } | null;
};

export type AdminUserDetail = {
  user: ManagedUser;
  profile: unknown;
  usage: Pick<
    CreditUsage,
    'availableCredits' | 'reservedCredits' | 'spentCredits' | 'subscription'
  > & {
    ledger: CreditUsage['ledger'];
  };
  recentJobs: Array<Record<string, unknown>>;
};

async function read<T>(
  path: string,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(path);
  if (!response.ok) throw new Error('Unable to load admin data');
  return response.json() as Promise<{ data: T; requestId: string }>;
}

async function write<T>(
  path: string,
  init: RequestInit,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(path, init);
  if (!response.ok) throw new Error('Unable to update admin data');
  return response.json() as Promise<{ data: T; requestId: string }>;
}

export const getAuthSession = (fetchImplementation?: FetchImplementation) =>
  read<AuthSessionData>('/api/auth/session', fetchImplementation);

export const getAdminOverview = (
  days = 30,
  fetchImplementation?: FetchImplementation,
) => read<AdminOverview>(`/api/admin/overview?days=${days}`, fetchImplementation);

export const listManagedUsers = (
  input: { query?: string } = {},
  fetchImplementation?: FetchImplementation,
) => {
  const search = new URLSearchParams({ limit: '50', offset: '0' });
  if (input.query) search.set('query', input.query);
  return read<ManagedUserPage>(
    `/api/admin/users?${search.toString()}`,
    fetchImplementation,
  );
};

export const getManagedUserDetail = (
  userId: string,
  fetchImplementation?: FetchImplementation,
) =>
  read<AdminUserDetail>(
    `/api/admin/users/${encodeURIComponent(userId)}`,
    fetchImplementation,
  );

export async function updateManagedUserRole(
  userId: string,
  role: UserRole,
  fetchImplementation: FetchImplementation = fetch,
) {
  return write<ManagedUser>(
    `/api/admin/users/${encodeURIComponent(userId)}/role`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    },
    fetchImplementation,
  );
}

export async function updateManagedUserBan(
  userId: string,
  banned: boolean,
  fetchImplementation: FetchImplementation = fetch,
) {
  return write<ManagedUser>(
    `/api/admin/users/${encodeURIComponent(userId)}/ban`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ banned }),
    },
    fetchImplementation,
  );
}

export async function adjustUserCredits(
  input: {
    clerkUserId: string;
    delta: number;
    reason: string;
    idempotencyKey: string;
  },
  fetchImplementation: FetchImplementation = fetch,
) {
  return write<CreditUsage>(
    '/api/admin/credits/adjust',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    fetchImplementation,
  );
}

export const listAdminAnalyses = (
  input: {
    status?: string;
    ticker?: string;
    clerkUserId?: string;
    limit?: number;
    offset?: number;
  } = {},
  fetchImplementation?: FetchImplementation,
) => {
  const search = new URLSearchParams({
    limit: String(input.limit ?? 50),
    offset: String(input.offset ?? 0),
  });
  if (input.status) search.set('status', input.status);
  if (input.ticker) search.set('ticker', input.ticker);
  if (input.clerkUserId) search.set('clerkUserId', input.clerkUserId);
  return read<Array<Record<string, unknown>>>(
    `/api/admin/analyses?${search.toString()}`,
    fetchImplementation,
  );
};

export async function retryAdminAnalysis(
  jobId: string,
  fetchImplementation: FetchImplementation = fetch,
) {
  return write<{
    originalJobId: string;
    job: { id: string };
    ownerUserId: string;
    requestId: string;
  }>(
    `/api/admin/analyses/${encodeURIComponent(jobId)}/retry`,
    { method: 'POST' },
    fetchImplementation,
  );
}
