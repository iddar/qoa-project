import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm/sql';
import { authGuard, authPlugin } from '../../app/plugins/auth';
import { parseLimit, parseCursor } from '../../app/utils/pagination';
import { db } from '../../db/client';
import { stores } from '../../db/schema';
import type { StatusHandler } from '../../types/handlers';
import { qrResponse, storeCreateRequest, storeListQuery, storeListResponse, storeResponse } from './model';

const generateStoreCode = () => `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

type StoreRow = {
  id: string;
  code: string;
  name: string;
  type: string | null;
  address: string | null;
  phone: string | null;
  status: string;
  createdAt: Date;
};

type StoreListRow = {
  id: string;
  code: string;
  name: string;
  type: string | null;
  address: string | null;
  phone: string | null;
  status: string;
  created_at: Date | string;
};

type StoreListQuery = {
  limit?: string;
  cursor?: string;
};

type StoreCreateBody = {
  name: string;
  type?: string;
  address?: string;
  phone?: string;
};

type StoreParams = {
  storeId: string;
};

type StoreListContext = {
  query: StoreListQuery;
  status: StatusHandler;
};

type StoreCreateContext = {
  body: StoreCreateBody;
  status: StatusHandler;
};

type StoreParamsContext = {
  params: StoreParams;
  status: StatusHandler;
};

const serializeStore = (store: StoreRow) => ({
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
    async ({ query, status }: StoreListContext) => {
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
      const safeLimit = Math.trunc(limit) + 1;
      const cursorFilter = cursorDate ? sql`where "stores"."created_at" < ${cursorDate}` : sql``;
      const listQuery = sql`
        select "id", "code", "name", "type", "address", "phone", "status", "created_at"
        from "stores"
        ${cursorFilter}
        order by "stores"."created_at" desc, "stores"."id" desc
        limit ${sql.raw(String(safeLimit))}
      `;
      const rawResults = (await db.execute(listQuery)) as StoreListRow[];
      const results = rawResults.map((store) => ({
        id: store.id,
        code: store.code,
        name: store.name,
        type: store.type,
        address: store.address,
        phone: store.phone,
        status: store.status,
        createdAt: store.created_at instanceof Date ? store.created_at : new Date(store.created_at),
      }));

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
      beforeHandle: authGuard({ allowApiKey: true }),
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
    async ({ body, status }: StoreCreateContext) => {
      const code = generateStoreCode();
      const [created] = (await db
        .insert(stores)
        .values({
          code,
          name: body.name,
          type: body.type ?? null,
          address: body.address ?? null,
          phone: body.phone ?? null,
        })
        .returning()) as StoreRow[];

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
      beforeHandle: authGuard({ allowApiKey: true }),
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
    async ({ params, status }: StoreParamsContext) => {
      const [store] = (await db.select().from(stores).where(eq(stores.id, params.storeId))) as StoreRow[];
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
      beforeHandle: authGuard({ allowApiKey: true }),
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
    async ({ params, status }: StoreParamsContext) => {
      const [store] = (await db.select().from(stores).where(eq(stores.id, params.storeId))) as StoreRow[];
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
      beforeHandle: authGuard({ allowApiKey: true }),
      response: {
        200: qrResponse,
      },
      detail: {
        summary: 'Obtener payload de registro',
      },
    },
  );
