export interface AuthUser {
  id: string;
  name: string;
  role: string;
}

export interface AuthSession {
  token: string;
  expiresAt: string;
  user: AuthUser;
}
