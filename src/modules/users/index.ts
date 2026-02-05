import { Elysia } from 'elysia';
import { and, desc, eq, lt, ne, or } from 'drizzle-orm';
import { authPlugin } from '../../app/plugins/auth';
import { db } from '../../db/client';
import { cards, users } from '../../db/schema';
import { cardListQuery, cardListResponse } from '../cards/model';
import {
  adminCreateUserRequest,
  adminCreateUserResponse,
  blockUserRequest,
  blockUserResponse,
  userMeUpdateRequest,
  userMeResponse,
} from './model';

const allowedRoles = ['consumer', 'customer', 'store_staff', 'store_admin', 'cpg_admin', 'qoa_support', 'qoa_admin'] as const;
const backofficeAdminRoles = ['qoa_admin'] as const;
const backofficeRoles = ['qoa_support', 'qoa_admin'] as const;
const temporaryPasswordLength = 14;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parseLimit = (limit?: string) => {
  const parsed = Number(limit ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
};

const parseCursor = (cursor?: string) => {
  if (!cursor) {
    return null;
  }
  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const serializeCard = (card: typeof cards.$inferSelect) => ({
  id: card.id,
  userId: card.userId,
  campaignId: card.campaignId,
  storeId: card.storeId ?? undefined,
  code: card.code,
  currentTierId: card.currentTierId ?? undefined,
  status: card.status,
  createdAt: card.createdAt.toISOString(),
});

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
    async ({ body, status }) => {
      const email = body.email ? body.email.toLowerCase() : null;
      const conditions = [eq(users.phone, body.phone)];
      if (email) {
        conditions.push(eq(users.email, email));
      }

      const whereClause = conditions.length === 1 ? conditions[0] : or(...conditions);
      const [existing] = await db.select().from(users).where(whereClause);
      if (existing) {
        return status(409, {
          error: {
            code: 'USER_EXISTS',
            message: 'El usuario ya existe',
          },
        });
      }

      // Validar coherencia rol/tenant
      const requiresTenant = ['store_staff', 'store_admin', 'cpg_admin'].includes(body.role);
      if (requiresTenant && (!body.tenantId || !body.tenantType)) {
        return status(400, {
          error: {
            code: 'TENANT_REQUIRED',
            message: 'Este rol requiere tenantId y tenantType',
          },
        });
      }

      if (!requiresTenant && (body.tenantId || body.tenantType)) {
        return status(400, {
          error: {
            code: 'TENANT_NOT_ALLOWED',
            message: 'Este rol no puede tener tenant',
          },
        });
      }

      if (body.role === 'cpg_admin' && body.tenantType !== 'cpg') {
        return status(400, {
          error: {
            code: 'INVALID_TENANT_TYPE',
            message: 'cpg_admin requiere tenantType = cpg',
          },
        });
      }

      if (['store_staff', 'store_admin'].includes(body.role) && body.tenantType !== 'store') {
        return status(400, {
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
        return status(500, {
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
    async ({ params, body, status }) => {
      const untilDate = body.until ? new Date(body.until) : null;
      if (body.until && Number.isNaN(untilDate?.getTime())) {
        return status(400, {
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'Fecha de bloqueo inválida',
          },
        });
      }

      if (untilDate && untilDate.getTime() <= Date.now()) {
        return status(400, {
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
        return status(404, {
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
    async ({ params, status }) => {
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
        return status(404, {
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
    '/me/cards',
    async ({ auth, query, status }) => {
      if (!auth || auth.type === 'api_key' || auth.type === 'dev_api_key') {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'Token de usuario requerido',
          },
        });
      }

      const cursorDate = parseCursor(query.cursor);
      if (query.cursor && !cursorDate) {
        return status(400, {
          error: {
            code: 'INVALID_CURSOR',
            message: 'Cursor inválido',
          },
        });
      }

      const limit = parseLimit(query.limit);
      let queryBuilder = db.select().from(cards).where(eq(cards.userId, auth.userId));
      if (cursorDate) {
        queryBuilder = queryBuilder.where(and(eq(cards.userId, auth.userId), lt(cards.createdAt, cursorDate)));
      }

      const results = await queryBuilder.orderBy(desc(cards.createdAt), desc(cards.id)).limit(limit + 1);
      const hasMore = results.length > limit;
      const items = hasMore ? results.slice(0, limit) : results;
      const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : null;

      return {
        data: items.map(serializeCard),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      auth: {
        roles: [...allowedRoles],
      },
      query: cardListQuery,
      response: {
        200: cardListResponse,
      },
      detail: {
        summary: 'Listar mis tarjetas',
      },
    },
  )
  .get(
    '/me',
    async ({ auth, status }) => {
      if (!auth || auth.type === 'api_key' || auth.type === 'dev_api_key') {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'Token de usuario requerido',
          },
        });
      }

      const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
      if (!user) {
        return status(404, {
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
  )
  .patch(
    '/me',
    async ({ auth, body, status }) => {
      if (!auth || auth.type === 'api_key' || auth.type === 'dev_api_key') {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'Token de usuario requerido',
          },
        });
      }

      if (body.name === undefined && body.email === undefined) {
        return status(400, {
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'Debes enviar al menos name o email',
          },
        });
      }

      const email = body.email?.toLowerCase();
      if (email) {
        const [existingEmail] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, email), ne(users.id, auth.userId)));

        if (existingEmail) {
          return status(409, {
            error: {
              code: 'USER_EXISTS',
              message: 'El email ya está en uso',
            },
          });
        }
      }

      const patch: {
        name?: string | null;
        email?: string | null;
        updatedAt: Date;
      } = {
        updatedAt: new Date(),
      };
      if (body.name !== undefined) {
        patch.name = body.name;
      }
      if (body.email !== undefined) {
        patch.email = email ?? null;
      }

      const [updated] = await db
        .update(users)
        .set(patch)
        .where(eq(users.id, auth.userId))
        .returning({
          id: users.id,
          phone: users.phone,
          email: users.email,
          name: users.name,
          role: users.role,
          status: users.status,
          tenantId: users.tenantId,
          tenantType: users.tenantType,
          blockedUntil: users.blockedUntil,
        });

      if (!updated) {
        return status(404, {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'Usuario no encontrado',
          },
        });
      }

      return {
        data: {
          id: updated.id,
          phone: updated.phone,
          email: updated.email ?? undefined,
          name: updated.name ?? undefined,
          role: updated.role,
          status: updated.status,
          tenantId: updated.tenantId ?? undefined,
          tenantType: updated.tenantType ?? undefined,
          blockedUntil: updated.blockedUntil ? updated.blockedUntil.toISOString() : undefined,
        },
      };
    },
    {
      auth: {
        roles: [...allowedRoles],
      },
      body: userMeUpdateRequest,
      response: {
        200: userMeResponse,
      },
      detail: {
        summary: 'Actualizar perfil del usuario autenticado',
      },
    },
  );
