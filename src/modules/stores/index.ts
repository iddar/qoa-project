import { Elysia } from 'elysia';
import { desc, eq, lt } from 'drizzle-orm';
import { authPlugin } from '../../app/plugins/auth';
import { parseLimit, parseCursor } from '../../app/utils/pagination';
import { db } from '../../db/client';
import { stores } from '../../db/schema';
import { qrResponse, storeCreateRequest, storeListQuery, storeListResponse, storeResponse } from './model';

const generateStoreCode = () => `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

const serializeStore = (store: typeof stores.$inferSelect) => ({
  id: store.id,
  code: store.code,
  name: store.name,
  type: store.type ?? undefined,
  address: store.address ?? undefined,
  phone: store.phone ?? undefined,
  status: store.status,
  createdAt: store.createdAt.toISOString(),
});

export const storesModule = new Elysia({
  prefix: '/stores',
  detail: {
    tags: ['Stores'],
  },
})
  .use(authPlugin)
  .get(
    '/',
    async ({ query, status }: any) => {
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
      let queryBuilder = db.select().from(stores);
      if (cursorDate) {
        queryBuilder = queryBuilder.where(lt(stores.createdAt, cursorDate));
      }

      const results = await queryBuilder.orderBy(desc(stores.createdAt), desc(stores.id)).limit(limit + 1);

      const hasMore = results.length > limit;
      const items = hasMore ? results.slice(0, limit) : results;
      const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : null;

      return {
        data: items.map(serializeStore),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      auth: {
        allowApiKey: true,
      },
      query: storeListQuery,
      response: {
        200: storeListResponse,
      },
      detail: {
        summary: 'Listar tiendas',
      },
    },
  )
  .post(
    '/',
    async ({ body, status }: any) => {
      const code = generateStoreCode();
      const [created] = await db
        .insert(stores)
        .values({
          code,
          name: body.name,
          type: body.type ?? null,
          address: body.address ?? null,
          phone: body.phone ?? null,
        })
        .returning();

      if (!created) {
        return status(500, {
          error: {
            code: 'STORE_CREATE_FAILED',
            message: 'No se pudo crear la tienda',
          },
        });
      }

      return status(201, {
        data: serializeStore(created),
      });
    },
    {
      auth: {
        allowApiKey: true,
      },
      body: storeCreateRequest,
      response: {
        201: storeResponse,
      },
      detail: {
        summary: 'Crear tienda',
      },
    },
  )
  .get(
    '/:storeId',
    async ({ params, status }: any) => {
      const [store] = await db.select().from(stores).where(eq(stores.id, params.storeId));
      if (!store) {
        return status(404, {
          error: {
            code: 'STORE_NOT_FOUND',
            message: 'Tienda no encontrada',
          },
        });
      }

      return {
        data: serializeStore(store),
      };
    },
    {
      auth: {
        allowApiKey: true,
      },
      response: {
        200: storeResponse,
      },
      detail: {
        summary: 'Obtener tienda',
      },
    },
  )
  .get(
    '/:storeId/qr',
    async ({ params, status }: any) => {
      const [store] = await db.select().from(stores).where(eq(stores.id, params.storeId));
      if (!store) {
        return status(404, {
          error: {
            code: 'STORE_NOT_FOUND',
            message: 'Tienda no encontrada',
          },
        });
      }

      return {
        data: {
          code: store.code,
          payload: {
            entityType: 'store',
            entityId: store.id,
            code: store.code,
          },
          expiresAt: undefined,
        },
      };
    },
    {
      auth: {
        allowApiKey: true,
      },
      response: {
        200: qrResponse,
      },
      detail: {
        summary: 'Obtener payload de registro',
      },
    },
  );
