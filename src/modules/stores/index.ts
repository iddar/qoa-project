import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm/sql';
import { authGuard, authPlugin } from '../../app/plugins/auth';
import type { AuthContext } from '../../app/plugins/auth';
import { parseLimit, parseCursor } from '../../app/utils/pagination';
import { generateCode } from '../../app/utils/generateCode';
import { db } from '../../db/client';
import { stores } from '../../db/schema';
import { generateStoreQrPayload } from '../../services/stores';
import type { StatusHandler } from '../../types/handlers';
import { qrResponse, storeCreateRequest, storeListQuery, storeListResponse, storeResponse } from './model';

const generateStoreCode = () => generateCode('sto', 20);

type StoreRow = {
  id: string;
  code: string;
  name: string;
  type: string | null;
  address: string | null;
  phone: string | null;
  street: string | null;
  exteriorNumber: string | null;
  interiorNumber: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
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
  street: string | null;
  exterior_number: string | null;
  interior_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
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
  street?: string;
  exteriorNumber?: string;
  interiorNumber?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
};

type StoreParams = {
  storeId: string;
};

type StoreListContext = {
  auth: AuthContext | null;
  query: StoreListQuery;
  status: StatusHandler;
};

type StoreCreateContext = {
  body: StoreCreateBody;
  status: StatusHandler;
};

type StoreParamsContext = {
  auth: AuthContext | null;
  params: StoreParams;
  status: StatusHandler;
};

const isStoreOperator = (auth: AuthContext) => {
  if (auth.type !== 'jwt' && auth.type !== 'dev') {
    return false;
  }

  return auth.role === 'store_admin' || auth.role === 'store_staff';
};

const canAccessStore = (auth: AuthContext, storeId: string) => {
  if (auth.type === 'jwt' || auth.type === 'dev') {
    if (!isStoreOperator(auth)) {
      return true;
    }

    return auth.tenantType === 'store' && auth.tenantId === storeId;
  }

  return auth.tenantType === 'store' && auth.tenantId === storeId;
};

const serializeStore = (store: StoreRow) => ({
  id: store.id,
  code: store.code,
  name: store.name,
  type: store.type ?? undefined,
  address: store.address ?? undefined,
  phone: store.phone ?? undefined,
  street: store.street ?? undefined,
  exteriorNumber: store.exteriorNumber ?? undefined,
  interiorNumber: store.interiorNumber ?? undefined,
  neighborhood: store.neighborhood ?? undefined,
  city: store.city ?? undefined,
  state: store.state ?? undefined,
  postalCode: store.postalCode ?? undefined,
  country: store.country ?? undefined,
  latitude: store.latitude ? Number(store.latitude) : undefined,
  longitude: store.longitude ? Number(store.longitude) : undefined,
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
    async ({ auth, query, status }: StoreListContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
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
      const safeLimit = Math.trunc(limit) + 1;
      const filters = [] as ReturnType<typeof sql>[];

      if (cursorDate) {
        filters.push(sql`"stores"."created_at" < ${cursorDate}`);
      }

      if (isStoreOperator(auth)) {
        if (auth.tenantType !== 'store' || !auth.tenantId) {
          return status(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'Usuario de tienda sin tenant válido',
            },
          });
        }

        filters.push(sql`"stores"."id" = ${auth.tenantId}`);
      }

      const whereClause = filters.length > 0 ? sql`where ${sql.join(filters, sql` and `)}` : sql``;
      const listQuery = sql`
        select "id", "code", "name", "type", "address", "phone",
               "street", "exterior_number", "interior_number",
               "neighborhood", "city", "state", "postal_code", "country",
               "latitude", "longitude",
               "status", "created_at"
        from "stores"
        ${whereClause}
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
        street: store.street,
        exteriorNumber: store.exterior_number,
        interiorNumber: store.interior_number,
        neighborhood: store.neighborhood,
        city: store.city,
        state: store.state,
        postalCode: store.postal_code,
        country: store.country,
        latitude: store.latitude,
        longitude: store.longitude,
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
          street: body.street ?? null,
          exteriorNumber: body.exteriorNumber ?? null,
          interiorNumber: body.interiorNumber ?? null,
          neighborhood: body.neighborhood ?? null,
          city: body.city ?? null,
          state: body.state ?? null,
          postalCode: body.postalCode ?? null,
          country: body.country ?? null,
          latitude: body.latitude?.toString() ?? null,
          longitude: body.longitude?.toString() ?? null,
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
    async ({ auth, params, status }: StoreParamsContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No puedes acceder a esta tienda',
          },
        });
      }

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
    async ({ auth, params, status }: StoreParamsContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No puedes acceder a esta tienda',
          },
        });
      }

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
        data: generateStoreQrPayload(store),
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
