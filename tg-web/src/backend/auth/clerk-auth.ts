import { createClerkClient } from '@clerk/backend';

import type { AuthService, AuthUser, ManagedUser, UserRole } from './contract';

export type ClerkAuthOptions = {
  secretKey: string;
  publishableKey: string;
  authorizedParties: string[];
};

export function clerkAuthOptionsFromEnv(
  env: Record<string, unknown>,
): ClerkAuthOptions {
  const secretKey = requiredString(env, 'CLERK_SECRET_KEY');
  const publishableKey = requiredString(env, 'VITE_CLERK_PUBLISHABLE_KEY');
  const authorizedParties = requiredString(env, 'CLERK_AUTHORIZED_PARTIES')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (authorizedParties.length === 0) {
    throw new Error('CLERK_AUTHORIZED_PARTIES must contain at least one URL');
  }
  for (const party of authorizedParties) {
    const url = new URL(party);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== party) {
      throw new Error(
        'CLERK_AUTHORIZED_PARTIES values must be HTTP(S) origins',
      );
    }
  }

  return { secretKey, publishableKey, authorizedParties };
}

export function createClerkAuthService({
  secretKey,
  publishableKey,
  authorizedParties,
}: ClerkAuthOptions): AuthService {
  const clerk = createClerkClient({ secretKey, publishableKey });

  async function ensureAssignedRole(userId: string) {
    const user = await clerk.users.getUser(userId);
    if (
      user.publicMetadata.role === 'admin' ||
      user.publicMetadata.role === 'user'
    ) {
      return user;
    }

    const firstPage = await clerk.users.getUserList({
      limit: 1,
      orderBy: '+created_at',
    });
    return clerk.users.updateUserMetadata(user.id, {
      publicMetadata: {
        role: firstPage.data[0]?.id === user.id ? 'admin' : 'user',
      },
    });
  }

  return {
    async authenticate(request) {
      const requestState = await clerk.authenticateRequest(request, {
        acceptsToken: 'session_token',
        authorizedParties,
      });
      if (!requestState.isAuthenticated) {
        return null;
      }

      const auth = requestState.toAuth();
      return { userId: auth.userId, sessionId: auth.sessionId };
    },

    async getUser(userId): Promise<AuthUser> {
      return normalizeUser(await ensureAssignedRole(userId));
    },

    async getManagedUser(userId): Promise<ManagedUser> {
      return normalizeManagedUser(await ensureAssignedRole(userId));
    },

    async listUsers(input) {
      const page = await clerk.users.getUserList({
        limit: input.limit,
        offset: input.offset,
        orderBy: '+created_at',
        query: input.query,
      });

      return {
        users: page.data.map(normalizeManagedUser),
        totalCount: page.totalCount,
      };
    },

    async setUserRole(userId, role) {
      const user = await clerk.users.updateUserMetadata(userId, {
        publicMetadata: { role },
      });
      return normalizeManagedUser(user);
    },

    async setUserBanned(userId, banned) {
      const user = banned
        ? await clerk.users.banUser(userId)
        : await clerk.users.unbanUser(userId);
      return normalizeManagedUser(user);
    },

    async getBillingIdentity(userId) {
      const user = await ensureAssignedRole(userId);
      const customerId = user.privateMetadata.stripeCustomerId;
      return {
        user: normalizeUser(user),
        stripeCustomerId:
          typeof customerId === 'string' && customerId ? customerId : null,
      };
    },

    async setStripeCustomerId(userId, customerId) {
      await clerk.users.updateUserMetadata(userId, {
        privateMetadata: { stripeCustomerId: customerId },
      });
    },
  };
}

type ClerkUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  imageUrl: string;
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{ id: string; emailAddress: string }>;
  publicMetadata: Record<string, unknown>;
  privateMetadata: Record<string, unknown>;
  createdAt: number;
  banned?: boolean;
};

function normalizeUser(user: ClerkUser): AuthUser {
  const primaryEmail = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  );
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

  return {
    id: user.id,
    displayName:
      fullName || user.username || primaryEmail?.emailAddress || 'User',
    email: primaryEmail?.emailAddress ?? null,
    imageUrl: user.imageUrl,
    role: normalizeRole(user.publicMetadata.role),
  };
}

function normalizeManagedUser(user: ClerkUser): ManagedUser {
  return {
    ...normalizeUser(user),
    createdAt: user.createdAt,
    banned: Boolean(user.banned),
  };
}

function normalizeRole(role: unknown): UserRole {
  return role === 'admin' ? 'admin' : 'user';
}

function requiredString(env: Record<string, unknown>, name: string): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}
