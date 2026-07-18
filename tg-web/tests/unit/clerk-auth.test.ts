import { beforeEach, describe, expect, it, vi } from 'vitest';

const clerkMocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  createClerkClient: vi.fn(),
  getUser: vi.fn(),
  getUserList: vi.fn(),
  updateUserMetadata: vi.fn(),
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
      users: {
        getUser: clerkMocks.getUser,
        getUserList: clerkMocks.getUserList,
        updateUserMetadata: clerkMocks.updateUserMetadata,
      },
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

  it('grants the first registered user the administrator role', async () => {
    const firstUser = {
      id: 'user-1',
      firstName: 'First',
      lastName: 'User',
      username: null,
      imageUrl: '',
      primaryEmailAddressId: 'email-1',
      emailAddresses: [{ id: 'email-1', emailAddress: 'first@example.test' }],
      publicMetadata: {},
      createdAt: 1,
    };
    clerkMocks.getUser.mockResolvedValue(firstUser);
    clerkMocks.getUserList.mockResolvedValue({
      data: [firstUser],
      totalCount: 1,
    });
    clerkMocks.updateUserMetadata.mockResolvedValue({
      ...firstUser,
      publicMetadata: { role: 'admin' },
    });
    const service = createClerkAuthService({
      secretKey: 'sk_test_secret',
      publishableKey: 'pk_test_public',
      authorizedParties: ['https://app.example.test'],
    });

    await expect(service.getUser('user-1')).resolves.toMatchObject({
      id: 'user-1',
      role: 'admin',
    });
    expect(clerkMocks.getUserList).toHaveBeenCalledWith({
      limit: 1,
      orderBy: '+created_at',
    });
    expect(clerkMocks.updateUserMetadata).toHaveBeenCalledWith('user-1', {
      publicMetadata: { role: 'admin' },
    });
  });

  it('keeps later registered users on the regular user role', async () => {
    const currentUser = {
      id: 'user-2',
      firstName: 'Later',
      lastName: 'User',
      username: null,
      imageUrl: '',
      primaryEmailAddressId: null,
      emailAddresses: [],
      publicMetadata: {},
      createdAt: 2,
    };
    clerkMocks.getUser.mockResolvedValue(currentUser);
    clerkMocks.getUserList.mockResolvedValue({
      data: [{ ...currentUser, id: 'user-1', createdAt: 1 }],
      totalCount: 2,
    });
    clerkMocks.updateUserMetadata.mockResolvedValue({
      ...currentUser,
      publicMetadata: { role: 'user' },
    });
    const service = createClerkAuthService({
      secretKey: 'sk_test_secret',
      publishableKey: 'pk_test_public',
      authorizedParties: ['https://app.example.test'],
    });

    await expect(service.getUser('user-2')).resolves.toMatchObject({
      id: 'user-2',
      role: 'user',
    });
    expect(clerkMocks.updateUserMetadata).toHaveBeenCalledWith('user-2', {
      publicMetadata: { role: 'user' },
    });
  });

  it('does not overwrite an explicitly assigned role', async () => {
    clerkMocks.getUser.mockResolvedValue({
      id: 'user-1',
      firstName: 'First',
      lastName: 'User',
      username: null,
      imageUrl: '',
      primaryEmailAddressId: null,
      emailAddresses: [],
      publicMetadata: { role: 'user' },
      createdAt: 1,
    });
    const service = createClerkAuthService({
      secretKey: 'sk_test_secret',
      publishableKey: 'pk_test_public',
      authorizedParties: ['https://app.example.test'],
    });

    await expect(service.getUser('user-1')).resolves.toMatchObject({
      id: 'user-1',
      role: 'user',
    });
    expect(clerkMocks.getUserList).not.toHaveBeenCalled();
    expect(clerkMocks.updateUserMetadata).not.toHaveBeenCalled();
  });

  it('reads the Stripe customer ID from private metadata', async () => {
    clerkMocks.getUser.mockResolvedValue({
      id: 'user-1',
      firstName: 'Billing',
      lastName: 'User',
      username: null,
      imageUrl: '',
      primaryEmailAddressId: 'email-1',
      emailAddresses: [{ id: 'email-1', emailAddress: 'billing@example.test' }],
      publicMetadata: { role: 'user' },
      privateMetadata: { stripeCustomerId: 'cus_test' },
      createdAt: 1,
    });
    const service = createClerkAuthService({
      secretKey: 'sk_test_secret',
      publishableKey: 'pk_test_public',
      authorizedParties: ['https://app.example.test'],
    });

    await expect(service.getBillingIdentity('user-1')).resolves.toMatchObject({
      user: { id: 'user-1', email: 'billing@example.test' },
      stripeCustomerId: 'cus_test',
    });
  });

  it('stores the Stripe customer ID in private metadata', async () => {
    const service = createClerkAuthService({
      secretKey: 'sk_test_secret',
      publishableKey: 'pk_test_public',
      authorizedParties: ['https://app.example.test'],
    });

    await service.setStripeCustomerId('user-1', 'cus_test');

    expect(clerkMocks.updateUserMetadata).toHaveBeenCalledWith('user-1', {
      privateMetadata: { stripeCustomerId: 'cus_test' },
    });
  });
});
