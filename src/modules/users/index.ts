import { Elysia } from 'elysia';
import { eq, or } from 'drizzle-orm';
import { authPlugin } from '../../app/plugins/auth';
import { db } from '../../db/client';
import { users } from '../../db/schema';
import {
  adminCreateUserRequest,
  adminCreateUserResponse,
  blockUserRequest,
  blockUserResponse,
  userMeResponse,
} from './model';

const allowedRoles = ['consumer', 'customer', 'store_staff', 'store_admin', 'cpg_admin', 'qoa_support', 'qoa_admin'] as const;
const backofficeAdminRoles = ['qoa_admin'] as const;
const backofficeRoles = ['qoa_support', 'qoa_admin'] as const;
const temporaryPasswordLength = 14;

const generateTemporaryPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let value = '';
  for (let i = 0; i < temporaryPasswordLength; i += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
};

export const usersModule = new Elysia({
  prefix: '/users',
  detail: {
    tags: ['Users'],
  },
})
  .use(authPlugin)
  .post(
    '/',
    async ({ body, error }) => {
      const email = body.email ? body.email.toLowerCase() : null;
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

      // Validar coherencia rol/tenant
      const requiresTenant = ['store_staff', 'store_admin', 'cpg_admin'].includes(body.role);
      if (requiresTenant && (!body.tenantId || !body.tenantType)) {
        return error(400, {
          error: {
            code: 'TENANT_REQUIRED',
            message: 'Este rol requiere tenantId y tenantType',
          },
        });
      }

      if (!requiresTenant && (body.tenantId || body.tenantType)) {
        return error(400, {
          error: {
            code: 'TENANT_NOT_ALLOWED',
            message: 'Este rol no puede tener tenant',
          },
        });
      }

      if (body.role === 'cpg_admin' && body.tenantType !== 'cpg') {
        return error(400, {
          error: {
            code: 'INVALID_TENANT_TYPE',
            message: 'cpg_admin requiere tenantType = cpg',
          },
        });
      }

      if (['store_staff', 'store_admin'].includes(body.role) && body.tenantType !== 'store') {
        return error(400, {
          error: {
            code: 'INVALID_TENANT_TYPE',
            message: 'store_staff/store_admin requiere tenantType = store',
          },
        });
      }

      const temporaryPassword = body.password ?? generateTemporaryPassword();
      const passwordHash = await Bun.password.hash(temporaryPassword);

      const [created] = await db
        .insert(users)
        .values({
          phone: body.phone,
          email,
          name: body.name ?? null,
          passwordHash,
          role: body.role,
          tenantId: body.tenantId ?? null,
          tenantType: body.tenantType ?? null,
        })
        .returning({
          id: users.id,
          phone: users.phone,
          email: users.email,
          name: users.name,
          role: users.role,
          status: users.status,
          tenantId: users.tenantId,
          tenantType: users.tenantType,
        });

      if (!created) {
        return error(500, {
          error: {
            code: 'USER_CREATE_FAILED',
            message: 'No se pudo crear el usuario',
          },
        });
      }

      return {
        data: {
          id: created.id,
          phone: created.phone,
          email: created.email ?? undefined,
          name: created.name ?? undefined,
          role: created.role,
          status: created.status,
          tenantId: created.tenantId ?? undefined,
          tenantType: created.tenantType ?? undefined,
          temporaryPassword: body.password ? undefined : temporaryPassword,
        },
      };
    },
    {
      auth: {
        roles: [...backofficeAdminRoles],
      },
      body: adminCreateUserRequest,
      response: {
        200: adminCreateUserResponse,
      },
      detail: {
        summary: 'Crear usuario desde backoffice',
      },
    },
  )
  .post(
    '/:id/block',
    async ({ params, body, error }) => {
      const untilDate = body.until ? new Date(body.until) : null;
      if (body.until && Number.isNaN(untilDate?.getTime())) {
        return error(400, {
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'Fecha de bloqueo inválida',
          },
        });
      }

      if (untilDate && untilDate.getTime() <= Date.now()) {
        return error(400, {
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'La fecha de bloqueo debe ser futura',
          },
        });
      }

      const [updated] = await db
        .update(users)
        .set({
          status: untilDate ? 'active' : 'suspended',
          blockedAt: new Date(),
          blockedUntil: untilDate,
          blockedReason: body.reason ?? null,
        })
        .where(eq(users.id, params.id))
        .returning({
          id: users.id,
          status: users.status,
          blockedUntil: users.blockedUntil,
          blockedReason: users.blockedReason,
        });

      if (!updated) {
        return error(404, {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'Usuario no encontrado',
          },
        });
      }

      return {
        data: {
          id: updated.id,
          status: updated.status,
          blockedUntil: updated.blockedUntil ? updated.blockedUntil.toISOString() : undefined,
          blockedReason: updated.blockedReason ?? undefined,
        },
      };
    },
    {
      auth: {
        roles: [...backofficeRoles],
      },
      body: blockUserRequest,
      response: {
        200: blockUserResponse,
      },
      detail: {
        summary: 'Bloquear usuario (temporal o permanente)',
      },
    },
  )
  .post(
    '/:id/unblock',
    async ({ params, error }) => {
      const [updated] = await db
        .update(users)
        .set({
          status: 'active',
          blockedAt: null,
          blockedUntil: null,
          blockedReason: null,
        })
        .where(eq(users.id, params.id))
        .returning({
          id: users.id,
          status: users.status,
          blockedUntil: users.blockedUntil,
          blockedReason: users.blockedReason,
        });

      if (!updated) {
        return error(404, {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'Usuario no encontrado',
          },
        });
      }

      return {
        data: {
          id: updated.id,
          status: updated.status,
          blockedUntil: updated.blockedUntil ? updated.blockedUntil.toISOString() : undefined,
          blockedReason: updated.blockedReason ?? undefined,
        },
      };
    },
    {
      auth: {
        roles: [...backofficeRoles],
      },
      response: {
        200: blockUserResponse,
      },
      detail: {
        summary: 'Desbloquear usuario',
      },
    },
  )
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
          tenantId: user.tenantId ?? undefined,
          tenantType: user.tenantType ?? undefined,
          blockedUntil: user.blockedUntil ? user.blockedUntil.toISOString() : undefined,
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
