import { Elysia } from 'elysia';
import { and, eq, isNull } from 'drizzle-orm';
import { authPlugin } from '../../app/plugins/auth';
import { db } from '../../db/client';
import { cards, stores, users } from '../../db/schema';
import { cardCreateRequest, cardDetailResponse, cardResponse, qrResponse } from './model';

const allowedRoles = ['consumer', 'customer', 'store_staff', 'store_admin', 'cpg_admin', 'qoa_support', 'qoa_admin'] as const;

const generateCardCode = () => `card_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;

export const serializeCard = (card: typeof cards.$inferSelect) => ({
  id: card.id,
  userId: card.userId,
  campaignId: card.campaignId,
  storeId: card.storeId ?? undefined,
  code: card.code,
  currentTierId: card.currentTierId ?? undefined,
  status: card.status,
  createdAt: card.createdAt.toISOString(),
});

export const cardsModule = new Elysia({
  prefix: '/cards',
  detail: {
    tags: ['Cards'],
  },
})
  .use(authPlugin)
  .post(
    '/',
    async ({ body, auth, status }) => {
      // Auth is guaranteed by the auth macro, but TypeScript doesn't know that
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      // Authorization checks
      if (auth.type === 'jwt' || auth.type === 'dev') {
        // User tokens can only create cards for themselves unless they're admins
        const isAdmin = ['store_admin', 'cpg_admin', 'qoa_admin'].includes(auth.role);
        if (!isAdmin && auth.userId !== body.userId) {
          return status(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'No puedes crear tarjetas para otros usuarios',
            },
          });
        }
      } else if (auth.type === 'api_key' || auth.type === 'dev_api_key') {
        // API keys can only create cards for users in their tenant
        const [user] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, body.userId));
        if (!user || user.tenantId !== auth.tenantId) {
          return status(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'No puedes crear tarjetas para usuarios fuera de tu tenant',
            },
          });
        }
      }

      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, body.userId));
      if (!user) {
        return status(404, {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'Usuario no encontrado',
          },
        });
      }

      if (body.storeId) {
        const [store] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, body.storeId));
        if (!store) {
          return status(404, {
            error: {
              code: 'STORE_NOT_FOUND',
              message: 'Tienda no encontrada',
            },
          });
        }
      }

      const conditions = [
        eq(cards.userId, body.userId),
        eq(cards.campaignId, body.campaignId),
        body.storeId ? eq(cards.storeId, body.storeId) : isNull(cards.storeId),
      ];
      const [existing] = await db
        .select({ id: cards.id })
        .from(cards)
        .where(and(...conditions));

      if (existing) {
        return status(409, {
          error: {
            code: 'CARD_EXISTS',
            message: 'La tarjeta ya existe',
          },
        });
      }

      const code = generateCardCode();
      const [created] = await db
        .insert(cards)
        .values({
          userId: body.userId,
          campaignId: body.campaignId,
          storeId: body.storeId ?? null,
          code,
        })
        .returning();

      if (!created) {
        return status(500, {
          error: {
            code: 'CARD_CREATE_FAILED',
            message: 'No se pudo crear la tarjeta',
          },
        });
      }

      return status(201, {
        data: serializeCard(created),
      });
    },
    {
      auth: {
        allowApiKey: true,
      },
      body: cardCreateRequest,
      response: {
        201: cardResponse,
      },
      detail: {
        summary: 'Crear tarjeta',
      },
    },
  )
  .get(
    '/:cardId',
    async ({ params, auth, status }) => {
      // Auth is guaranteed by the auth macro, but TypeScript doesn't know that
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const [card] = await db.select().from(cards).where(eq(cards.id, params.cardId));
      if (!card) {
        return status(404, {
          error: {
            code: 'CARD_NOT_FOUND',
            message: 'Tarjeta no encontrada',
          },
        });
      }

      // Authorization: verify ownership or tenant access
      if (auth.type === 'jwt' || auth.type === 'dev') {
        // Users can only view their own cards unless they're admins
        const isAdmin = ['store_admin', 'cpg_admin', 'qoa_admin'].includes(auth.role);
        if (!isAdmin && auth.userId !== card.userId) {
          return status(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'No tienes permiso para ver esta tarjeta',
            },
          });
        }
      } else if (auth.type === 'api_key' || auth.type === 'dev_api_key') {
        // API keys can only view cards for users in their tenant
        const [user] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, card.userId));
        if (!user || user.tenantId !== auth.tenantId) {
          return status(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'No tienes permiso para ver esta tarjeta',
            },
          });
        }
      }

      return {
        data: serializeCard(card),
      };
    },
    {
      auth: {
        allowApiKey: true,
      },
      response: {
        200: cardDetailResponse,
      },
      detail: {
        summary: 'Obtener tarjeta',
      },
    },
  )
  .get(
    '/:cardId/qr',
    async ({ params, auth, status }) => {
      // Auth is guaranteed by the auth macro, but TypeScript doesn't know that
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const [card] = await db.select().from(cards).where(eq(cards.id, params.cardId));
      if (!card) {
        return status(404, {
          error: {
            code: 'CARD_NOT_FOUND',
            message: 'Tarjeta no encontrada',
          },
        });
      }

      // Authorization: verify ownership - only the card owner can access their QR
      if (auth.type === 'jwt' || auth.type === 'dev') {
        if (auth.userId !== card.userId) {
          return status(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'No tienes permiso para acceder al QR de esta tarjeta',
            },
          });
        }
      } else {
        // API keys are not allowed for QR access - this is a user-only operation
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'El acceso al QR requiere un token de usuario',
          },
        });
      }

      return {
        data: {
          code: card.code,
          payload: {
            entityType: 'card',
            entityId: card.id,
            code: card.code,
          },
          expiresAt: undefined,
        },
      };
    },
    {
      auth: {
        roles: [...allowedRoles],
      },
      response: {
        200: qrResponse,
      },
      detail: {
        summary: 'Obtener payload de tarjeta',
      },
    },
  );
