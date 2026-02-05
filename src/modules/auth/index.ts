import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { refreshTokens, users } from '../../db/schema';
import {
  authPlugin,
  findUserByEmail,
  issueAccessToken,
  persistRefreshToken,
  rotateRefreshToken,
} from '../../app/plugins/auth';
import { authResponse, loginRequest, refreshRequest } from './model';

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
    '/login',
    async ({ body, jwt, authHelpers, error }) => {
      const email = body.email.toLowerCase();
      const user = await findUserByEmail(email);

      if (!user || !user.passwordHash) {
        return error(401, invalidCredentialsError);
      }

      if (user.status === 'suspended') {
        return error(403, {
          error: {
            code: 'ACCOUNT_SUSPENDED',
            message: 'La cuenta está suspendida',
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

      const access = await issueAccessToken(
        { jwt },
        {
          sub: user.id,
          role: user.role,
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
        roles: ['consumer', 'store_staff', 'store_admin', 'cpg_admin', 'qoa_admin'],
      },
      detail: {
        summary: 'Revocar refresh token',
      },
    },
  );
