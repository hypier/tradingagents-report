export type UserRole = 'user' | 'admin';

export type AuthSession = {
  userId: string;
  sessionId: string;
};

export type AuthUser = {
  id: string;
  displayName: string;
  email: string | null;
  imageUrl: string;
  role: UserRole;
};

export type ManagedUser = AuthUser & {
  createdAt: number;
  banned: boolean;
};

export type ManagedUserPage = {
  users: ManagedUser[];
  totalCount: number;
};

export type BillingIdentity = {
  user: AuthUser;
  stripeCustomerId: string | null;
};

export interface AuthService {
  authenticate(request: Request): Promise<AuthSession | null>;
  getUser(userId: string): Promise<AuthUser>;
  getManagedUser(userId: string): Promise<ManagedUser>;
  listUsers(input: {
    limit: number;
    offset: number;
    query?: string;
  }): Promise<ManagedUserPage>;
  setUserRole(userId: string, role: UserRole): Promise<ManagedUser>;
  setUserBanned(userId: string, banned: boolean): Promise<ManagedUser>;
  getBillingIdentity(userId: string): Promise<BillingIdentity>;
  setStripeCustomerId(userId: string, customerId: string): Promise<void>;
}
