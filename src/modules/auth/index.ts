import { Elysia } from 'elysia';
import { eq, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { refreshTokens, users } from '../../db/schema';
import {
  authPlugin,
  findUserByEmail,
  issueAccessToken,
  persistRefreshToken,
  rotateRefreshToken,
} from '../../app/plugins/auth';
import { authResponse, loginRequest, refreshRequest, signupRequest } from './model';

const invalidCredentialsError = {
  error: {
    code: 'UNAUTHORIZED',
    message: 'Credenciales inválidas',
  },
};

export const authModule = new Elysia({
  prefix: '/auth',
  detail: {
    tags: ['Auth'],
  },
})
  .use(authPlugin)
  .post(
    '/signup',
    async ({ body, jwt, authHelpers, error }) => {
      const email = body.email ? body.email.toLowerCase() : null;
      const role = body.role ?? 'consumer';

      if (role !== 'consumer' && role !== 'customer') {
        return error(400, {
          error: {
            code: 'INVALID_ROLE',
            message: 'Rol inválido para signup',
          },
        });
      }

      const conditions = [eq(users.phone, body.phone)];
      if (email) {
        conditions.push(eq(users.email, email));
      }

      const whereClause = conditions.length === 1 ? conditions[0] : or(...conditions);
      const [existing] = await db.select().from(users).where(whereClause);
      if (existing) {
        return error(409, {
          error: {
            code: 'USER_EXISTS',
            message: 'El usuario ya existe',
          },
        });
      }

      const passwordHash = await Bun.password.hash(body.password);
      const [created] = await db
        .insert(users)
        .values({
          phone: body.phone,
          email,
          name: body.name ?? null,
          passwordHash,
          role,
        })
        .returning({
          id: users.id,
          email: users.email,
          phone: users.phone,
          role: users.role,
        });

      if (!created) {
        return error(500, {
          error: {
            code: 'SIGNUP_FAILED',
            message: 'No se pudo crear el usuario',
          },
        });
      }

      const access = await issueAccessToken(
        { jwt },
        {
          sub: created.id,
          role: created.role,
        },
      );

      const refreshToken = authHelpers.generateRefreshToken();
      await persistRefreshToken(created.id, refreshToken);

      return {
        data: {
          accessToken: access.token,
          refreshToken,
          expiresIn: access.expiresIn,
          user: {
            id: created.id,
            email: created.email ?? undefined,
            phone: created.phone ?? undefined,
            role: created.role,
          },
        },
      };
    },
    {
      body: signupRequest,
      response: {
        200: authResponse,
      },
      detail: {
        summary: 'Signup de consumidor/customer',
      },
    },
  )
  .post(
    '/login',
    async ({ body, jwt, authHelpers, error }) => {
      const email = body.email.toLowerCase();
      const user = await findUserByEmail(email);

      if (!user || !user.passwordHash) {
        return error(401, invalidCredentialsError);
      }

      if (user.status === 'suspended' || (user.blockedUntil && user.blockedUntil.getTime() > Date.now())) {
        return error(403, {
          error: {
            code: 'ACCOUNT_BLOCKED',
            message: 'La cuenta está bloqueada',
          },
        });
      }

      const passwordMatches = await Bun.password.verify(body.password, user.passwordHash);
      if (!passwordMatches) {
        return error(401, invalidCredentialsError);
      }

      const access = await issueAccessToken(
        { jwt },
        {
          sub: user.id,
          role: user.role,
          tenantId: user.tenantId,
          tenantType: user.tenantType,
        },
      );

      const refreshToken = authHelpers.generateRefreshToken();
      await persistRefreshToken(user.id, refreshToken);

      return {
        data: {
          accessToken: access.token,
          refreshToken,
          expiresIn: access.expiresIn,
          user: {
            id: user.id,
            email: user.email ?? undefined,
            phone: user.phone ?? undefined,
            role: user.role,
            tenantId: user.tenantId ?? undefined,
            tenantType: user.tenantType ?? undefined,
          },
        },
      };
    },
    {
      body: loginRequest,
      response: {
        200: authResponse,
      },
      detail: {
        summary: 'Login con email y password',
      },
    },
  )
  .post(
    '/refresh',
    async ({ body, jwt, error }) => {
      const rotated = await rotateRefreshToken(body.refreshToken);
      if (!rotated) {
        return error(401, {
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Refresh token inválido o expirado',
          },
        });
      }

      const [user] = await db.select().from(users).where(eq(users.id, rotated.userId));
      if (!user) {
        return error(404, {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'Usuario no encontrado',
          },
        });
      }

      if (user.status === 'suspended' || (user.blockedUntil && user.blockedUntil.getTime() > Date.now())) {
        return error(403, {
          error: {
            code: 'ACCOUNT_BLOCKED',
            message: 'La cuenta está bloqueada',
          },
        });
      }

      const access = await issueAccessToken(
        { jwt },
        {
          sub: user.id,
          role: user.role,
          tenantId: user.tenantId,
          tenantType: user.tenantType,
        },
      );

      return {
        data: {
          accessToken: access.token,
          refreshToken: rotated.refreshToken,
          expiresIn: access.expiresIn,
        },
      };
    },
    {
      body: refreshRequest,
      response: {
        200: authResponse,
      },
      detail: {
        summary: 'Rotar refresh token',
      },
    },
  )
  .post(
    '/logout',
    async ({ body, authHelpers }) => {
      const tokenHash = authHelpers.toHash(body.refreshToken);
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, tokenHash));

      return new Response(null, { status: 204 });
    },
    {
      body: refreshRequest,
      auth: {
        roles: ['consumer', 'customer', 'store_staff', 'store_admin', 'cpg_admin', 'qoa_support', 'qoa_admin'],
      },
      detail: {
        summary: 'Revocar refresh token',
      },
    },
  );
