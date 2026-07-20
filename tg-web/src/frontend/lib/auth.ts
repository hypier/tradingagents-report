import type {
  AuthUser,
  ManagedUser,
  ManagedUserPage,
  UserRole,
} from '@/backend/auth/contract';

type FetchImplementation = typeof fetch;

export type AuthSessionData = {
  authenticated: true;
  session: { id: string };
  user: AuthUser;
};

async function read<T>(
  path: string,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(path);
  if (!response.ok) throw new Error('Unable to load account data');
  return response.json() as Promise<{ data: T; requestId: string }>;
}

export const getAuthSession = (fetchImplementation?: FetchImplementation) =>
  read<AuthSessionData>('/api/auth/session', fetchImplementation);

export const listManagedUsers = (
  input: { query?: string } = {},
  fetchImplementation?: FetchImplementation,
) => {
  const search = new URLSearchParams({ limit: '50', offset: '0' });
  if (input.query) search.set('query', input.query);
  return read<
    Omit<ManagedUserPage, 'users'> & {
      users: Array<ManagedUser & { availableCredits: number }>;
    }
  >(`/api/admin/users?${search.toString()}`, fetchImplementation);
};

export async function updateManagedUserRole(
  userId: string,
  role: UserRole,
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(
    `/api/admin/users/${encodeURIComponent(userId)}/role`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    },
  );
  if (!response.ok) throw new Error('Unable to update user role');
  return response.json() as Promise<{
    data: AuthUser;
    requestId: string;
  }>;
}

export async function adjustManagedUserCredits(
  userId: string,
  input: { adjustmentId: string; delta: number; reason?: string },
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(
    `/api/admin/users/${encodeURIComponent(userId)}/credit-adjustments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string };
    } | null;
    const error = new Error(
      body?.error?.code === 'INSUFFICIENT_CREDITS'
        ? 'INSUFFICIENT_CREDITS'
        : 'Unable to adjust user credits',
    );
    error.name = body?.error?.code ?? 'CREDIT_ADJUSTMENT_FAILED';
    throw error;
  }
  return response.json() as Promise<{
    data: { availableCredits: number };
    requestId: string;
  }>;
}
