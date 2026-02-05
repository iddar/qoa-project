import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { authPlugin } from '../../app/plugins/auth';
import { db } from '../../db/client';
import { users } from '../../db/schema';
import { userMeResponse } from './model';

const allowedRoles = ['consumer', 'store_staff', 'store_admin', 'cpg_admin', 'qoa_admin'] as const;

export const usersModule = new Elysia({
  prefix: '/users',
  detail: {
    tags: ['Users'],
  },
})
  .use(authPlugin)
  .get(
    '/me',
    async ({ auth, error }) => {
      if (!auth || auth.type === 'api_key' || auth.type === 'dev_api_key') {
        return error(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'Token de usuario requerido',
          },
        });
      }

      const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
      if (!user) {
        return error(404, {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'Usuario no encontrado',
          },
        });
      }

      return {
        data: {
          id: user.id,
          phone: user.phone,
          email: user.email ?? undefined,
          name: user.name ?? undefined,
          role: user.role,
          status: user.status,
        },
      };
    },
    {
      auth: {
        roles: [...allowedRoles],
      },
      response: {
        200: userMeResponse,
      },
      detail: {
        summary: 'Obtener perfil del usuario autenticado',
      },
    },
  );
