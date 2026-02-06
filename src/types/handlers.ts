import type { AuthContext } from '../app/plugins/auth';

export type StatusHandler = <T>(code: number, body: T) => T;

export type JwtPayload = {
  sub?: unknown;
  scopes?: unknown;
  role?: unknown;
  tenantId?: unknown;
  tenantType?: unknown;
};

export type JwtSigner = {
  sign: (payload: Record<string, unknown>, options?: { exp?: number }) => Promise<string>;
};

export type JwtVerifier = {
  verify: (token: string) => Promise<JwtPayload | null>;
};

export type JwtContext = JwtSigner & JwtVerifier;

export type AuthHelpers = {
  toHash: (value: string) => string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  generateRefreshToken: () => string;
};

export type AuthPluginContext = {
  request: Request;
  jwt: JwtVerifier;
  status: StatusHandler;
  auth: AuthContext | null;
};
