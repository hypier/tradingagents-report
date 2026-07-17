import { createClerkClient } from '@clerk/backend';

import type { AuthService, AuthUser } from './contract';

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
      const user = await clerk.users.getUser(userId);
      const primaryEmail = user.emailAddresses.find(
        (email) => email.id === user.primaryEmailAddressId,
      );
      const fullName = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(' ');

      return {
        id: user.id,
        displayName:
          fullName || user.username || primaryEmail?.emailAddress || 'User',
        email: primaryEmail?.emailAddress ?? null,
        imageUrl: user.imageUrl,
        role: user.publicMetadata.role === 'admin' ? 'admin' : 'user',
      };
    },
  };
}

function requiredString(env: Record<string, unknown>, name: string): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}
