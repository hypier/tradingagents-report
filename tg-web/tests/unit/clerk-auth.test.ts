import { beforeEach, describe, expect, it, vi } from 'vitest';

const clerkMocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  createClerkClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@clerk/backend', () => ({
  createClerkClient: clerkMocks.createClerkClient,
}));

import { createClerkAuthService } from '../../src/backend/auth/clerk-auth';

describe('createClerkAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clerkMocks.createClerkClient.mockReturnValue({
      authenticateRequest: clerkMocks.authenticateRequest,
      users: { getUser: clerkMocks.getUser },
    });
  });

  it('authenticates session tokens for the configured browser origins', async () => {
    clerkMocks.authenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: 'user-1', sessionId: 'session-1' }),
    });
    const service = createClerkAuthService({
      secretKey: 'sk_test_secret',
      publishableKey: 'pk_test_public',
      authorizedParties: ['https://app.example.test'],
    });
    const request = new Request('https://app.example.test/api/analyses');

    await expect(service.authenticate(request)).resolves.toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
    });
    expect(clerkMocks.createClerkClient).toHaveBeenCalledWith({
      secretKey: 'sk_test_secret',
      publishableKey: 'pk_test_public',
    });
    expect(clerkMocks.authenticateRequest).toHaveBeenCalledWith(request, {
      acceptsToken: 'session_token',
      authorizedParties: ['https://app.example.test'],
    });
  });

  it('returns null when Clerk does not authenticate the request', async () => {
    clerkMocks.authenticateRequest.mockResolvedValue({
      isAuthenticated: false,
    });
    const service = createClerkAuthService({
      secretKey: 'sk_test_secret',
      publishableKey: 'pk_test_public',
      authorizedParties: ['https://app.example.test'],
    });

    await expect(
      service.authenticate(new Request('https://app.example.test/api')),
    ).resolves.toBeNull();
  });

  it('normalizes the Clerk user and accepts only the admin role', async () => {
    clerkMocks.getUser.mockResolvedValue({
      id: 'user-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      imageUrl: 'https://img.example.test/user-1.png',
      primaryEmailAddressId: 'email-1',
      emailAddresses: [{ id: 'email-1', emailAddress: 'ada@example.test' }],
      publicMetadata: { role: 'admin' },
    });
    const service = createClerkAuthService({
      secretKey: 'sk_test_secret',
      publishableKey: 'pk_test_public',
      authorizedParties: ['https://app.example.test'],
    });

    await expect(service.getUser('user-1')).resolves.toEqual({
      id: 'user-1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.test',
      imageUrl: 'https://img.example.test/user-1.png',
      role: 'admin',
    });
    expect(clerkMocks.getUser).toHaveBeenCalledWith('user-1');
  });
});
