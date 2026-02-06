import { jwt } from '@elysiajs/jwt';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { createHash, randomBytes } from 'node:crypto';
import { db } from '../../db/client';
import { apiKeys, refreshTokens, users } from '../../db/schema';
import type { AuthPluginContext, JwtSigner } from '../../types/handlers';

const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.AUTH_ACCESS_TTL_SECONDS ?? 900);
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.AUTH_REFRESH_TTL_DAYS ?? 30);

export type AuthContext =
  | {
      type: 'jwt' | 'dev';
      userId: string;
      role: string;
      scopes: string[];
      tenantId: string | null;
      tenantType: 'cpg' | 'store' | null;
    }
  | {
      type: 'api_key' | 'dev_api_key';
      apiKeyId: string;
      scopes: string[];
      tenantId: string;
      tenantType: 'cpg' | 'store';
    };

export type AuthRequirement = {
  roles?: string[];
  scopes?: string[];
  allowApiKey?: boolean;
};

type MacroContext = {
  onBeforeHandle: (handler: (context: AuthPluginContext) => Promise<unknown> | unknown) => void;
};

type AuthContextState = AuthPluginContext & {
  auth: AuthContext | null;
};

type ApiKeyRow = {
  id: string;
  scopes: string[] | null;
  tenantId: string;
  tenantType: 'cpg' | 'store';
};

type AuthUserRow = {
  id: string;
  status: string;
  blockedUntil: Date | null;
  tenantId: string | null;
  tenantType: 'cpg' | 'store' | null;
};

type RefreshSessionRow = {
  id: string;
  userId: string;
};

type LoginUserRow = {
  id: string;
  email: string | null;
  phone: string;
  passwordHash: string | null;
  role: string;
  status: string;
  blockedUntil: Date | null;
  tenantId: string | null;
  tenantType: 'cpg' | 'store' | null;
};

const toHash = (value: string) => createHash('sha256').update(value).digest('hex');

const buildError = (code: string, message: string) => ({
  error: {
    code,
    message,
  },
});

export const authPlugin = new Elysia({ name: 'auth' })
  .use(
    jwt({
      name: 'jwt',
      secret: process.env.JWT_SECRET ?? 'dev-secret',
    }),
  )
  .derive(() => ({
    auth: null as AuthContext | null,
  }))
  .decorate('authHelpers', {
    toHash,
    accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: REFRESH_TOKEN_TTL_DAYS,
    generateRefreshToken: () => randomBytes(48).toString('base64url'),
  })
  .macro(({ onBeforeHandle }: MacroContext) => ({
    auth: (requirement?: AuthRequirement) => {
      onBeforeHandle(async (context) => {
        return applyAuth(context, requirement);
      });
    },
  }));

const isUserBlocked = (user: { status: string; blockedUntil: Date | null }) => {
  if (user.status === 'suspended') {
    return true;
  }

  return Boolean(user.blockedUntil && user.blockedUntil.getTime() > Date.now());
};
const resolveAuth = async (context: AuthContextState, requirement: AuthRequirement) => {
  const devMode = process.env.AUTH_DEV_MODE === 'true' && process.env.NODE_ENV !== 'production';
  if (devMode) {
    const devAuth = resolveDevAuth(context);
    if (devAuth) {
      return devAuth;
    }
  }

  const authorization = context.request.headers.get('authorization');
  const apiKeyHeader = context.request.headers.get('x-api-key');

  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;
  const apiKeyCandidate = apiKeyHeader ?? (bearer?.startsWith('qoa_') ? bearer : null);

  if (apiKeyCandidate && (requirement.allowApiKey || !bearer)) {
    const apiKeyHash = toHash(apiKeyCandidate);
    const [apiKey] = (await db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.keyHash, apiKeyHash),
          isNull(apiKeys.revokedAt),
          or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
        ),
      )) as ApiKeyRow[];

    if (!apiKey) {
      return null;
    }

    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, apiKey.id));

    return {
      type: 'api_key',
      apiKeyId: apiKey.id,
      scopes: apiKey.scopes ?? [],
      tenantId: apiKey.tenantId,
      tenantType: apiKey.tenantType,
    } satisfies AuthContext;
  }

  if (!bearer) {
    return null;
  }

  try {
    const payload = await context.jwt.verify(bearer);
    if (!payload || typeof payload.sub !== 'string') {
      return null;
    }

    const scopes = Array.isArray(payload.scopes) ? payload.scopes.filter((scope: unknown) => typeof scope === 'string') : [];
    const role = typeof payload.role === 'string' ? payload.role : 'consumer';
    const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId : null;
    const tenantType = payload.tenantType === 'cpg' || payload.tenantType === 'store' ? payload.tenantType : null;

    return {
      type: 'jwt',
      userId: payload.sub,
      role,
      scopes,
      tenantId,
      tenantType,
    } satisfies AuthContext;
  } catch {
    return null;
  }
};

const applyAuth = async (context: AuthContextState, requirement?: AuthRequirement) => {
  const requirementConfig = requirement ?? {};
  const authContext = await resolveAuth(context, requirementConfig);

  if (!authContext) {
    return context.status(401, buildError('UNAUTHORIZED', 'Autenticación requerida'));
  }

  if (authContext.type === 'jwt') {
  const [user] = (await db.select().from(users).where(eq(users.id, authContext.userId))) as AuthUserRow[];
    if (!user) {
      return context.status(401, buildError('INVALID_TOKEN', 'Usuario inválido'));
    }

    if (isUserBlocked(user)) {
      return context.status(403, buildError('ACCOUNT_BLOCKED', 'Usuario bloqueado'));
    }

    // Enriquecer contexto con tenant del usuario
    authContext.tenantId = user.tenantId;
    authContext.tenantType = user.tenantType;
  }

  if (requirementConfig.roles?.length) {
    const isApiKey = authContext.type === 'api_key' || authContext.type === 'dev_api_key';
    if (isApiKey) {
      return context.status(403, buildError('FORBIDDEN', 'Rol requerido'));
    }

    const userRole = (authContext as Extract<AuthContext, { type: 'jwt' | 'dev' }>).role;
    if (!requirementConfig.roles.includes(userRole)) {
      return context.status(403, buildError('FORBIDDEN', 'Rol requerido'));
    }
  }

  if (requirementConfig.scopes?.length) {
    const scopes = authContext.scopes;
    const hasScopes = requirementConfig.scopes.every((scope) => scopes.includes(scope));

    if (!hasScopes) {
      return context.status(403, buildError('INSUFFICIENT_SCOPE', 'Scope insuficiente'));
    }
  }

  context.auth = authContext;
};

export const authGuard = (requirement?: AuthRequirement) => async (context: AuthContextState) => applyAuth(context, requirement);

const resolveDevAuth = (context: AuthContextState): AuthContext | null => {
  const typeHeader = context.request.headers.get('x-dev-auth-type');
  if (typeHeader === 'api_key') {
    const apiKeyId = context.request.headers.get('x-dev-api-key-id');
    const tenantId = context.request.headers.get('x-dev-tenant-id');
    const tenantTypeHeader = context.request.headers.get('x-dev-tenant-type');
    const tenantType = tenantTypeHeader === 'cpg' || tenantTypeHeader === 'store' ? tenantTypeHeader : null;
    if (!apiKeyId || !tenantId || !tenantType) {
      return null;
    }

    return {
      type: 'dev_api_key',
      apiKeyId,
      scopes: parseScopes(context.request.headers.get('x-dev-api-key-scopes')),
      tenantId,
      tenantType,
    } satisfies AuthContext;
  }

  const userId = context.request.headers.get('x-dev-user-id');
  if (!userId) {
    return null;
  }

  const tenantIdHeader = context.request.headers.get('x-dev-tenant-id');
  const tenantTypeHeader = context.request.headers.get('x-dev-tenant-type');
  const tenantType = tenantTypeHeader === 'cpg' || tenantTypeHeader === 'store' ? tenantTypeHeader : null;

  return {
    type: 'dev',
    userId,
    role: context.request.headers.get('x-dev-user-role') ?? 'consumer',
    scopes: parseScopes(context.request.headers.get('x-dev-user-scopes')),
    tenantId: tenantIdHeader,
    tenantType,
  } satisfies AuthContext;
};

const parseScopes = (value: string | null) =>
  value
    ? value
        .split(',')
        .map((scope) => scope.trim())
        .filter(Boolean)
    : [];

export const issueAccessToken = async (context: { jwt: JwtSigner }, payload: {
  sub: string;
  role: string;
  scopes?: string[];
  tenantId?: string | null;
  tenantType?: 'cpg' | 'store' | null;
}) => {
  const token = await context.jwt.sign(
    {
      ...payload,
      iss: 'qoa',
      aud: 'qoa-api',
    },
    {
      exp: ACCESS_TOKEN_TTL_SECONDS,
    },
  );

  return {
    token,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
};

export const persistRefreshToken = async (userId: string, refreshToken: string) => {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const tokenHash = toHash(refreshToken);

  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return { tokenHash, expiresAt };
};

export const rotateRefreshToken = async (refreshToken: string) => {
  const tokenHash = toHash(refreshToken);
  const [session] = (await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())))) as RefreshSessionRow[];

  if (!session) {
    return null;
  }

  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, session.id));

  const newToken = randomBytes(48).toString('base64url');
  await persistRefreshToken(session.userId, newToken);

  return {
    userId: session.userId,
    refreshToken: newToken,
  };
};

export const findUserByEmail = async (email: string) => {
  const [user] = (await db.select().from(users).where(eq(users.email, email))) as LoginUserRow[];
  return user ?? null;
};
