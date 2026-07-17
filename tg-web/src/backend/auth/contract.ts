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

export interface AuthService {
  authenticate(request: Request): Promise<AuthSession | null>;
  getUser(userId: string): Promise<AuthUser>;
}
