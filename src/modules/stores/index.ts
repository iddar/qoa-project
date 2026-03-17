import { Elysia, t } from 'elysia';
import { and, eq, lt } from 'drizzle-orm';
import { sql } from 'drizzle-orm/sql';
import { authGuard, authPlugin } from '../../app/plugins/auth';
import type { AuthContext } from '../../app/plugins/auth';
import { parseLimit, parseCursor } from '../../app/utils/pagination';
import { generateCode } from '../../app/utils/generateCode';
import { db } from '../../db/client';
import { stores, cpgs, cpgStoreRelations } from '../../db/schema';
import { generateStoreQrPayload } from '../../services/stores';
import { getRelatedCpgIdsForStore, getRelatedStoreIdsForCpg, touchStoreCpgRelations } from '../../services/store-cpg-relations';
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
  )
  // ========== STORE-FACING: GET RELATED CPGs ==========
  .get(
    '/:storeId/cpgs',
    async ({ auth, params, status }: { auth: AuthContext | null; params: { storeId: string }; status: StatusHandler }) => {
      if (!auth) {
        return status(401, { error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida' } });
      }

      // Allow store operator or CPG admin viewing their stores
      const isStoreOperator = (auth.type === 'jwt' || auth.type === 'dev') && 
        (auth.role === 'store_admin' || auth.role === 'store_staff') && 
        auth.tenantType === 'store' && auth.tenantId === params.storeId;
      const isCpgAccess = (auth.type === 'jwt' || auth.type === 'dev') && auth.role === 'cpg_admin' && auth.tenantType === 'cpg';

      if (!isStoreOperator && !isCpgAccess && !(auth.role === 'qoa_admin' || auth.role === 'qoa_support')) {
        return status(403, { error: { code: 'FORBIDDEN', message: 'No tienes permisos para ver CPGs de esta tienda' } });
      }

      const relatedCpgIds = await getRelatedCpgIdsForStore(params.storeId);

      if (relatedCpgIds.length === 0) {
        return { data: [] };
      }

      const rows = (await db
        .select({
          id: cpgs.id,
          name: cpgs.name,
          status: cpgs.status,
          firstActivityAt: cpgStoreRelations.firstActivityAt,
          lastActivityAt: cpgStoreRelations.lastActivityAt,
        })
        .from(cpgs)
        .innerJoin(cpgStoreRelations, eq(cpgs.id, cpgStoreRelations.cpgId))
        .where(eq(cpgStoreRelations.storeId, params.storeId))
        .orderBy(sql`${cpgStoreRelations.lastActivityAt} DESC NULLS LAST`)) as Array<{
          id: string;
          name: string;
          status: string;
          firstActivityAt: Date | null;
          lastActivityAt: Date | null;
        }>;

      return {
        data: rows.map(row => ({
          id: row.id,
          name: row.name,
          status: row.status,
          firstActivityAt: row.firstActivityAt?.toISOString() ?? undefined,
          lastActivityAt: row.lastActivityAt?.toISOString() ?? undefined,
        })),
      };
    },
    {
      beforeHandle: authGuard({ roles: ['store_admin', 'store_staff', 'cpg_admin', 'qoa_admin', 'qoa_support'], allowApiKey: true }),
      response: {
        200: t.Object({
          data: t.Array(t.Object({
            id: t.String(),
            name: t.String(),
            status: t.String(),
            firstActivityAt: t.Optional(t.String()),
            lastActivityAt: t.Optional(t.String()),
          })),
        }),
      },
      detail: { summary: 'Listar CPGs relacionados con una tienda' },
    },
  )
  // ========== CPG-FACING: MANAGE CPG-STORE RELATIONS ==========
  .get(
    '/cpgs/:cpgId/stores',
    async ({ auth, params, query, status }: { auth: AuthContext | null; params: { cpgId: string }; query: { limit?: string; cursor?: string; status?: string }; status: StatusHandler }) => {
      if (!auth) {
        return status(401, { error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida' } });
      }

      // Allow CPG admin for their CPG or QOA
      const isCpgAccess = (auth.type === 'jwt' || auth.type === 'dev') && 
        auth.role === 'cpg_admin' && auth.tenantType === 'cpg' && auth.tenantId === params.cpgId;

      if (!isCpgAccess && !(auth.role === 'qoa_admin' || auth.role === 'qoa_support')) {
        return status(403, { error: { code: 'FORBIDDEN', message: 'No tienes permisos para ver stores de este CPG' } });
      }

      const limit = parseLimit(query.limit ?? '50');
      const cursorDate = parseCursor(query.cursor);
      const conditions = [eq(cpgStoreRelations.cpgId, params.cpgId)];

      if (query.status) {
        conditions.push(eq(cpgStoreRelations.status, query.status as 'active' | 'inactive'));
      }
      if (cursorDate) {
        conditions.push(lt(cpgStoreRelations.updatedAt, cursorDate));
      }

      const rows = (await db
        .select({
          id: cpgStoreRelations.id,
          storeId: cpgStoreRelations.storeId,
          status: cpgStoreRelations.status,
          source: cpgStoreRelations.source,
          firstActivityAt: cpgStoreRelations.firstActivityAt,
          lastActivityAt: cpgStoreRelations.lastActivityAt,
          createdAt: cpgStoreRelations.createdAt,
          name: stores.name,
          code: stores.code,
          neighborhood: stores.neighborhood,
          city: stores.city,
          state: stores.state,
        })
        .from(cpgStoreRelations)
        .innerJoin(stores, eq(cpgStoreRelations.storeId, stores.id))
        .where(and(...conditions))
        .orderBy(desc(cpgStoreRelations.updatedAt), desc(cpgStoreRelations.id))
        .limit(limit + 1)) as Array<{
          id: string;
          storeId: string;
          status: string;
          source: string;
          firstActivityAt: Date | null;
          lastActivityAt: Date | null;
          createdAt: Date;
          name: string;
          code: string;
          neighborhood: string | null;
          city: string | null;
          state: string | null;
        }>;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.updatedAt.toISOString() : null;

      return {
        data: items.map(row => ({
          storeId: row.storeId,
          storeName: row.name,
          storeCode: row.code,
          neighborhood: row.neighborhood ?? undefined,
          city: row.city ?? undefined,
          state: row.state ?? undefined,
          status: row.status,
          source: row.source,
          firstActivityAt: row.firstActivityAt?.toISOString() ?? undefined,
          lastActivityAt: row.lastActivityAt?.toISOString() ?? undefined,
        })),
        pagination: { hasMore, nextCursor: nextCursor ?? undefined },
      };
    },
    {
      beforeHandle: authGuard({ roles: ['cpg_admin', 'qoa_admin', 'qoa_support'], allowApiKey: true }),
      response: {
        200: t.Object({
          data: t.Array(t.Object({
            storeId: t.String(),
            storeName: t.String(),
            storeCode: t.String(),
            neighborhood: t.Optional(t.String()),
            city: t.Optional(t.String()),
            state: t.Optional(t.String()),
            status: t.String(),
            source: t.String(),
            firstActivityAt: t.Optional(t.String()),
            lastActivityAt: t.Optional(t.String()),
          })),
          pagination: t.Object({
            hasMore: t.Boolean(),
            nextCursor: t.Optional(t.String()),
          }),
        }),
      },
      detail: { summary: 'Listar tiendas relacionadas con un CPG' },
    },
  )
  .post(
    '/cpgs/:cpgId/stores',
    async ({ auth, params, body, status }: { auth: AuthContext | null; params: { cpgId: string }; body: { storeIds: string[] }; status: StatusHandler }) => {
      if (!auth) {
        return status(401, { error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida' } });
      }

      const isCpgAccess = (auth.type === 'jwt' || auth.type === 'dev') && 
        auth.role === 'cpg_admin' && auth.tenantType === 'cpg' && auth.tenantId === params.cpgId;

      if (!isCpgAccess && !(auth.role === 'qoa_admin' || auth.role === 'qoa_support')) {
        return status(403, { error: { code: 'FORBIDDEN', message: 'No tienes permisos para agregar stores a este CPG' } });
      }

      if (!body.storeIds || body.storeIds.length === 0) {
        return status(400, { error: { code: 'INVALID_ARGUMENT', message: 'Debes proporcionar al menos un storeId' } });
      }

      const now = new Date();
      const results: Array<{ storeId: string; success: boolean }> = [];

      for (const storeId of body.storeIds) {
        try {
          // Check if relation already exists
          const [existing] = await db
            .select({ id: cpgStoreRelations.id })
            .from(cpgStoreRelations)
            .where(and(eq(cpgStoreRelations.cpgId, params.cpgId), eq(cpgStoreRelations.storeId, storeId)))
            .limit(1);

          if (existing) {
            // Reactivate if inactive
            await db
              .update(cpgStoreRelations)
              .set({ status: 'active', source: 'manual', updatedAt: now })
              .where(eq(cpgStoreRelations.id, existing.id));
            results.push({ storeId, success: true });
          } else {
            // Create new relation
            await db.insert(cpgStoreRelations).values({
              cpgId: params.cpgId,
              storeId,
              status: 'active',
              source: 'manual',
              createdAt: now,
              updatedAt: now,
            });
            results.push({ storeId, success: true });
          }
        } catch {
          results.push({ storeId, success: false });
        }
      }

      return {
        data: {
          success: true,
          created: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: ['cpg_admin', 'qoa_admin', 'qoa_support'], allowApiKey: true }),
      body: t.Object({
        storeIds: t.Array(t.String({ format: 'uuid' })),
      }),
      detail: { summary: 'Agregar tiendas a un CPG (relación manual)' },
    },
  )
  .delete(
    '/cpgs/:cpgId/stores/:storeId',
    async ({ auth, params, status }: { auth: AuthContext | null; params: { cpgId: string; storeId: string }; status: StatusHandler }) => {
      if (!auth) {
        return status(401, { error: { code: 'UNAUTHORIZED', message: 'Autenticación requerida' } });
      }

      const isCpgAccess = (auth.type === 'jwt' || auth.type === 'dev') && 
        auth.role === 'cpg_admin' && auth.tenantType === 'cpg' && auth.tenantId === params.cpgId;

      if (!isCpgAccess && !(auth.role === 'qoa_admin' || auth.role === 'qoa_support')) {
        return status(403, { error: { code: 'FORBIDDEN', message: 'No tienes permisos para eliminar stores de este CPG' } });
      }

      const [existing] = await db
        .select({ id: cpgStoreRelations.id })
        .from(cpgStoreRelations)
        .where(and(eq(cpgStoreRelations.cpgId, params.cpgId), eq(cpgStoreRelations.storeId, params.storeId)))
        .limit(1);

      if (!existing) {
        return status(404, { error: { code: 'NOT_FOUND', message: 'Relación no encontrada' } });
      }

      // Soft delete - set status to inactive
      await db
        .update(cpgStoreRelations)
        .set({ status: 'inactive', updatedAt: new Date() })
        .where(eq(cpgStoreRelations.id, existing.id));

      return { data: { success: true } };
    },
    {
      beforeHandle: authGuard({ roles: ['cpg_admin', 'qoa_admin', 'qoa_support'], allowApiKey: true }),
      detail: { summary: 'Eliminar tienda de un CPG (relación)' },
    },
  );
