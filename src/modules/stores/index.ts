import { Elysia, t } from "elysia";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { sql } from "drizzle-orm/sql";
import { authGuard, authPlugin } from "../../app/plugins/auth";
import type { AuthContext } from "../../app/plugins/auth";
import { parseLimit, parseCursor } from "../../app/utils/pagination";
import { generateCode } from "../../app/utils/generateCode";
import { db } from "../../db/client";
import { stores, cpgs, cpgStoreRelations, storeProducts, products, brands, cards, users, transactions, transactionItems, inventoryMovements, storeCheckins } from "../../db/schema";
import { findPendingCheckinsForStore, matchCheckinWithTransaction } from "../../services/store-checkin";
import { generateStoreQrPayload } from "../../services/stores";
import { resolveCustomerByPhone } from "../../services/phone-customer-resolve";
import { createStorePosTransaction, toDetailPayload } from "../transactions";
import { previewInventoryImport, summarizeConfirmedInventoryRows } from "../../services/store-inventory";
import {
  getRelatedCpgIdsForStore,
  getRelatedStoreIdsForCpg,
  touchStoreCpgRelations,
  ensureOrganicRelation,
} from "../../services/store-cpg-relations";
import type { StatusHandler } from "../../types/handlers";
import {
  qrResponse,
  storeCreateRequest,
  storeListQuery,
  storeListResponse,
  storeResponse,
  storeProductSchema,
  storeProductCreateRequest,
  storeProductUpdateRequest,
  storeProductListQuery,
  storeProductResponse,
  storeProductListResponse,
  storeProductSearchQuery,
  storeTransactionCreateRequest,
  storeTransactionSchema,
  storeTransactionResponse,
  storeTransactionListQuery,
  storeTransactionListResponse,
  storeBrandListResponse,
  storeCustomerResolveRequest,
  storeCustomerResolveResponse,
  inventoryIntakePreviewRequest,
  inventoryIntakePreviewResponse,
  inventoryIntakeConfirmRequest,
  inventoryIntakeConfirmResponse,
  inventoryMovementListQuery,
  inventoryMovementListResponse,
} from "./model";

const getAuthRole = (auth: AuthContext): string | null => {
  if (auth.type === "jwt" || auth.type === "dev") {
    return auth.role;
  }
  return null;
};

const generateStoreCode = () => generateCode("sto", 20);

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

type StoreProductRow = {
  id: string;
  store_id: string;
  product_id: string | null;
  cpg_id: string | null;
  name: string;
  sku: string | null;
  unit_type: string;
  price: string;
  stock: number;
  status: string;
  created_at: Date;
};

type InventoryMovementListRow = {
  id: string;
  store_id: string;
  store_product_id: string;
  type: 'intake' | 'sale' | 'adjustment';
  quantity_delta: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: Date;
  product_name: string;
  sku: string | null;
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
  const role = getAuthRole(auth);
  if (!role) return false;
  return role === "store_admin" || role === "store_staff";
};

const canAccessStore = (auth: AuthContext, storeId: string) => {
  if (auth.type === "jwt" || auth.type === "dev") {
    if (!isStoreOperator(auth)) {
      return true;
    }

    return auth.tenantType === "store" && auth.tenantId === storeId;
  }

  return auth.tenantType === "store" && auth.tenantId === storeId;
};

const parseCardLookupInput = (value: string) => {
  const trimmed = value
    .trim()
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/”/g, '"');

  if (!trimmed) {
    return null;
  }

  const tryParsePayload = (candidate: string) => {
    try {
      const payload = JSON.parse(candidate) as {
        entityType?: string;
        entityId?: string;
        code?: string;
        payload?: { entityType?: string; entityId?: string; code?: string };
      };
      const resolvedPayload = payload.payload ?? payload;
      if (resolvedPayload.entityType === "card" && typeof resolvedPayload.entityId === "string") {
        return {
          kind: "cardId" as const,
          value: resolvedPayload.entityId,
        };
      }
      if (resolvedPayload.entityType === "card" && typeof resolvedPayload.code === "string") {
        return {
          kind: "cardCode" as const,
          value: resolvedPayload.code,
        };
      }
    } catch {
      return null;
    }

    return null;
  };

  if (trimmed.startsWith("{")) {
    const parsed = tryParsePayload(trimmed) ?? (trimmed.endsWith("}") ? null : tryParsePayload(`${trimmed}"}`));
    if (parsed) {
      return parsed;
    }
  }

  const jsonBlockMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonBlockMatch) {
    const parsed = tryParsePayload(jsonBlockMatch[0]);
    if (parsed) {
      return parsed;
    }
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(trimmed)) {
    return {
      kind: "cardId" as const,
      value: trimmed,
    };
  }

  const cleanedForPhone = trimmed.replace(/[^\d+]/g, '');
  if (/^\+?\d{10,16}$/.test(cleanedForPhone)) {
    return {
      kind: "phone" as const,
      value: cleanedForPhone,
    };
  }

  return {
    kind: "cardCode" as const,
    value: trimmed,
  };
};

const parseStoreTransactionItemMetadata = (metadata: string | null) => {
  if (!metadata) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadata) as {
      source?: string;
      storeProductId?: string;
      displayName?: string;
    };

    if (parsed.source !== "store_pos" || !parsed.storeProductId) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
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

const serializeStoreProduct = (row: StoreProductRow) => ({
  id: row.id,
  storeId: row.store_id,
  productId: row.product_id ?? undefined,
  cpgId: row.cpg_id ?? undefined,
  name: row.name,
  sku: row.sku ?? undefined,
  unitType: row.unit_type,
  price: Number(row.price),
  stock: row.stock,
  status: row.status,
  createdAt: row.created_at.toISOString(),
});

const serializeInventoryMovement = (row: InventoryMovementListRow) => ({
  id: row.id,
  storeId: row.store_id,
  storeProductId: row.store_product_id,
  storeProductName: row.product_name,
  sku: row.sku ?? undefined,
  type: row.type,
  quantityDelta: row.quantity_delta,
  balanceAfter: row.balance_after,
  referenceType: row.reference_type ?? undefined,
  referenceId: row.reference_id ?? undefined,
  notes: row.notes ?? undefined,
  createdAt: row.created_at.toISOString(),
});

export const storesModule = new Elysia({
  prefix: "/stores",
  detail: {
    tags: ["Stores"],
  },
})
  .use(authPlugin)
  .get(
    "/",
    async ({ auth, query, status }: StoreListContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const cursorDate = parseCursor(query.cursor);
      if (query.cursor && !cursorDate) {
        return status(400, {
          error: {
            code: "INVALID_CURSOR",
            message: "Cursor inválido",
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
        if (auth.tenantType !== "store" || !auth.tenantId) {
          return status(403, {
            error: {
              code: "FORBIDDEN",
              message: "Usuario de tienda sin tenant válido",
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
        summary: "Listar tiendas",
      },
    },
  )
  .post(
    "/",
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
            code: "STORE_CREATE_FAILED",
            message: "No se pudo crear la tienda",
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
        summary: "Crear tienda",
      },
    },
  )
  .get(
    "/:storeId",
    async ({ auth, params, status }: StoreParamsContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No puedes acceder a esta tienda",
          },
        });
      }

      const [store] = (await db
        .select()
        .from(stores)
        .where(eq(stores.id, params.storeId))) as StoreRow[];
      if (!store) {
        return status(404, {
          error: {
            code: "STORE_NOT_FOUND",
            message: "Tienda no encontrada",
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
        summary: "Obtener tienda",
      },
    },
  )
  .get(
    "/:storeId/qr",
    async ({ auth, params, status }: StoreParamsContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No puedes acceder a esta tienda",
          },
        });
      }

      const [store] = (await db
        .select()
        .from(stores)
        .where(eq(stores.id, params.storeId))) as StoreRow[];
      if (!store) {
        return status(404, {
          error: {
            code: "STORE_NOT_FOUND",
            message: "Tienda no encontrada",
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
        summary: "Obtener payload de registro",
      },
    },
  )
  // ========== STORE-FACING: GET RELATED CPGs ==========
  .get(
    "/:storeId/cpgs",
    async ({
      auth,
      params,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      const role = getAuthRole(auth);
      const isStoreOperator =
        (auth.type === "jwt" || auth.type === "dev") &&
        (role === "store_admin" || role === "store_staff") &&
        auth.tenantType === "store" &&
        auth.tenantId === params.storeId;
      const isCpgAccess =
        (auth.type === "jwt" || auth.type === "dev") &&
        role === "cpg_admin" &&
        auth.tenantType === "cpg";

      if (
        !isStoreOperator &&
        !isCpgAccess &&
        !(role === "qoa_admin" || role === "qoa_support")
      ) {
        return status(403, {
          error: { code: "FORBIDDEN", message: "No tienes permisos para ver CPGs de esta tienda" },
        });
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
        data: rows.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          firstActivityAt: row.firstActivityAt?.toISOString() ?? undefined,
          lastActivityAt: row.lastActivityAt?.toISOString() ?? undefined,
        })),
      };
    },
    {
      beforeHandle: authGuard({
        roles: ["store_admin", "store_staff", "cpg_admin", "qoa_admin", "qoa_support"],
        allowApiKey: true,
      }),
      response: {
        200: t.Object({
          data: t.Array(
            t.Object({
              id: t.String(),
              name: t.String(),
              status: t.String(),
              firstActivityAt: t.Optional(t.String()),
              lastActivityAt: t.Optional(t.String()),
            }),
          ),
        }),
      },
      detail: { summary: "Listar CPGs relacionados con una tienda" },
    },
  )
  // ========== CPG-FACING: MANAGE CPG-STORE RELATIONS ==========
  .get(
    "/cpgs/:cpgId/stores",
    async ({
      auth,
      params,
      query,
      status,
    }: {
      auth: AuthContext | null;
      params: { cpgId: string };
      query: { limit?: string; cursor?: string; status?: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      const role = getAuthRole(auth);
      const isCpgAccess =
        (auth.type === "jwt" || auth.type === "dev") &&
        role === "cpg_admin" &&
        auth.tenantType === "cpg" &&
        auth.tenantId === params.cpgId;

      if (!isCpgAccess && !(role === "qoa_admin" || role === "qoa_support")) {
        return status(403, {
          error: { code: "FORBIDDEN", message: "No tienes permisos para ver stores de este CPG" },
        });
      }

      const limit = parseLimit(query.limit ?? "50");
      const cursorDate = parseCursor(query.cursor);
      const conditions = [eq(cpgStoreRelations.cpgId, params.cpgId)];

      if (query.status) {
        conditions.push(eq(cpgStoreRelations.status, query.status as "active" | "inactive"));
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
          updatedAt: cpgStoreRelations.updatedAt,
          name: stores.name,
          code: stores.code,
          neighborhood: stores.neighborhood,
          city: stores.city,
          state: stores.state,
          address: stores.address,
          type: stores.type,
          latitude: stores.latitude,
          longitude: stores.longitude,
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
        updatedAt: Date | null;
        name: string;
        code: string;
        neighborhood: string | null;
        city: string | null;
        state: string | null;
        address: string | null;
        type: string | null;
        latitude: string | null;
        longitude: string | null;
      }>;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items[items.length - 1]?.updatedAt
          ? items[items.length - 1]!.updatedAt!.toISOString()
          : null;

      return {
        data: items.map((row) => ({
          storeId: row.storeId,
          storeName: row.name,
          storeCode: row.code,
          neighborhood: row.neighborhood ?? undefined,
          city: row.city ?? undefined,
          state: row.state ?? undefined,
          address: row.address ?? undefined,
          type: row.type ?? undefined,
          latitude: row.latitude ? Number(row.latitude) : undefined,
          longitude: row.longitude ? Number(row.longitude) : undefined,
          status: row.status,
          source: row.source,
          firstActivityAt: row.firstActivityAt?.toISOString() ?? undefined,
          lastActivityAt: row.lastActivityAt?.toISOString() ?? undefined,
        })),
        pagination: { hasMore, nextCursor: nextCursor ?? undefined },
      };
    },
    {
      beforeHandle: authGuard({
        roles: ["cpg_admin", "qoa_admin", "qoa_support"],
        allowApiKey: true,
      }),
      response: {
        200: t.Object({
          data: t.Array(
            t.Object({
              storeId: t.String(),
              storeName: t.String(),
              storeCode: t.String(),
              neighborhood: t.Optional(t.String()),
              city: t.Optional(t.String()),
              state: t.Optional(t.String()),
              address: t.Optional(t.String()),
              type: t.Optional(t.String()),
              latitude: t.Optional(t.Number()),
              longitude: t.Optional(t.Number()),
              status: t.String(),
              source: t.String(),
              firstActivityAt: t.Optional(t.String()),
              lastActivityAt: t.Optional(t.String()),
            }),
          ),
          pagination: t.Object({
            hasMore: t.Boolean(),
            nextCursor: t.Optional(t.String()),
          }),
        }),
      },
      detail: { summary: "Listar tiendas relacionadas con un CPG" },
    },
  )
  .post(
    "/cpgs/:cpgId/stores",
    async ({
      auth,
      params,
      body,
      status,
    }: {
      auth: AuthContext | null;
      params: { cpgId: string };
      body: { storeIds: string[] };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      const role = getAuthRole(auth);
      const isCpgAccess =
        (auth.type === "jwt" || auth.type === "dev") &&
        role === "cpg_admin" &&
        auth.tenantType === "cpg" &&
        auth.tenantId === params.cpgId;

      if (!isCpgAccess && !(role === "qoa_admin" || role === "qoa_support")) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para agregar stores a este CPG",
          },
        });
      }

      if (!body.storeIds || body.storeIds.length === 0) {
        return status(400, {
          error: { code: "INVALID_ARGUMENT", message: "Debes proporcionar al menos un storeId" },
        });
      }

      const now = new Date();
      const results: Array<{ storeId: string; success: boolean }> = [];

      for (const storeId of body.storeIds) {
        try {
          const [existing] = (await db
            .select({ id: cpgStoreRelations.id })
            .from(cpgStoreRelations)
            .where(
              and(
                eq(cpgStoreRelations.cpgId, params.cpgId),
                eq(cpgStoreRelations.storeId, storeId),
              ),
            )
            .limit(1)) as Array<{ id: string }> || [null];

          if (existing) {
            // Reactivate if inactive
            await db
              .update(cpgStoreRelations)
              .set({ status: "active", source: "manual", updatedAt: now })
              .where(eq(cpgStoreRelations.id, existing.id));
            results.push({ storeId, success: true });
          } else {
            // Create new relation
            await db.insert(cpgStoreRelations).values({
              cpgId: params.cpgId,
              storeId,
              status: "active",
              source: "manual",
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
          created: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
          results,
        },
      };
    },
    {
      beforeHandle: authGuard({
        roles: ["cpg_admin", "qoa_admin", "qoa_support"],
        allowApiKey: true,
      }),
      body: t.Object({
        storeIds: t.Array(t.String({ format: "uuid" })),
      }),
      detail: { summary: "Agregar tiendas a un CPG (relación manual)" },
    },
  )
  // @ts-ignore: TypeScript loses inference after long chain
  .delete(
    "/cpgs/:cpgId/stores/:storeId",
    async ({
      auth,
      params,
      status,
    }: {
      auth: AuthContext | null;
      params: { cpgId: string; storeId: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      const role = getAuthRole(auth);
      const isCpgAccess =
        (auth.type === "jwt" || auth.type === "dev") &&
        role === "cpg_admin" &&
        auth.tenantType === "cpg" &&
        auth.tenantId === params.cpgId;

      if (!isCpgAccess && !(role === "qoa_admin" || role === "qoa_support")) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para eliminar stores de este CPG",
          },
        });
      }

      const [existing] = (await db
        .select({ id: cpgStoreRelations.id })
        .from(cpgStoreRelations)
        .where(
          and(
            eq(cpgStoreRelations.cpgId, params.cpgId),
            eq(cpgStoreRelations.storeId, params.storeId),
          ),
        )
        .limit(1)) as Array<{ id: string }> || [null];

      if (!existing) {
        return status(404, { error: { code: "NOT_FOUND", message: "Relación no encontrada" } });
      }

      // Soft delete - set status to inactive
      await db
        .update(cpgStoreRelations)
        .set({ status: "inactive", updatedAt: new Date() })
        .where(eq(cpgStoreRelations.id, existing.id));

      return { data: { success: true } };
    },
    {
      beforeHandle: authGuard({
        roles: ["cpg_admin", "qoa_admin", "qoa_support"],
        allowApiKey: true,
      }),
      detail: { summary: "Eliminar tienda de un CPG (relación)" },
    },
  )
  // ========== STORE PRODUCTS ==========
  .get(
    "/:storeId/products",
    async ({
      auth,
      params,
      query,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string };
      query: { limit?: string; cursor?: string; status?: string; search?: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, { error: { code: "FORBIDDEN", message: "No puedes acceder a esta tienda" } });
      }

      const cursorDate = parseCursor(query.cursor);
      const limit = parseLimit(query.limit);
      const safeLimit = Math.trunc(limit) + 1;

      const filters = [sql`"store_products"."store_id" = ${params.storeId}`];

      if (query.status) {
        filters.push(sql`"store_products"."status" = ${query.status}`);
      }

      if (query.search) {
        filters.push(sql`"store_products"."name" ILIKE ${'%' + query.search + '%'}`);
      }

      if (cursorDate) {
        filters.push(sql`"store_products"."created_at" < ${cursorDate}`);
      }

      const whereClause = filters.length > 0 ? sql`where ${sql.join(filters, sql` and `)}` : sql``;

      const rows = (await db.execute(sql`
        select "id", "store_id", "product_id", "cpg_id", "name", "sku", "unit_type", "price", "stock", "status", "created_at"
        from "store_products"
        ${whereClause}
        order by "store_products"."created_at" desc
        limit ${sql.raw(String(safeLimit))}
      `)) as StoreProductRow[];

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.created_at.toISOString() : null;

      return {
        data: items.map(serializeStoreProduct),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      query: storeProductListQuery,
      response: { 200: storeProductListResponse },
      detail: { summary: "Listar productos de una tienda" },
    },
  )
  .post(
    "/:storeId/products",
    async ({
      auth,
      params,
      body,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string };
      body: { name: string; sku?: string; productId?: string; cpgId?: string; price: number };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, { error: { code: "FORBIDDEN", message: "No puedes acceder a esta tienda" } });
      }

      let inferredCpgId: string | null = body.cpgId ?? null;

      if (body.productId) {
        const [productRow] = (await db
          .select({ brandId: products.brandId })
          .from(products)
          .where(eq(products.id, body.productId))
          .limit(1)) as Array<{ brandId: string | null }>;

        if (productRow?.brandId) {
          const [brandRow] = (await db
            .select({ cpgId: brands.cpgId })
            .from(brands)
            .where(eq(brands.id, productRow.brandId))
            .limit(1)) as Array<{ cpgId: string | null }>;

          if (brandRow?.cpgId) {
            inferredCpgId = brandRow.cpgId;
            await ensureOrganicRelation(params.storeId, brandRow.cpgId);
          }
        }
      } else if (body.cpgId) {
        await ensureOrganicRelation(params.storeId, body.cpgId);
      }

      const [created] = (await db
        .insert(storeProducts)
        .values({
          storeId: params.storeId,
          name: body.name,
          sku: body.sku ?? null,
          productId: body.productId ?? null,
          cpgId: inferredCpgId,
          price: body.price.toString(),
          stock: 0,
        })
        .returning()) as StoreProductRow[];

      if (!created) {
        return status(500, {
          error: {
            code: "STORE_PRODUCT_CREATE_FAILED",
            message: "No se pudo crear el producto",
          },
        });
      }

      return status(201, {
        data: serializeStoreProduct(created),
      });
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      body: storeProductCreateRequest,
      response: { 201: storeProductResponse },
      detail: { summary: "Crear producto en catálogo de tienda" },
    },
  )
  .get(
    "/:storeId/products/:productId",
    async ({
      auth,
      params,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string; productId: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, { error: { code: "FORBIDDEN", message: "No puedes acceder a esta tienda" } });
      }

      const [row] = (await db.execute(sql`
        select "id", "store_id", "product_id", "cpg_id", "name", "sku", "unit_type", "price", "stock", "status", "created_at"
        from "store_products"
        where "id" = ${params.productId} and "store_id" = ${params.storeId}
      `)) as StoreProductRow[];

      if (!row) {
        return status(404, { error: { code: "NOT_FOUND", message: "Producto no encontrado" } });
      }

      return { data: serializeStoreProduct(row) };
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      response: { 200: storeProductResponse },
      detail: { summary: "Obtener producto de tienda" },
    },
  )
  .patch(
    "/:storeId/products/:productId",
    async ({
      auth,
      params,
      body,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string; productId: string };
      body: { name?: string; sku?: string; cpgId?: string; price?: number; status?: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, { error: { code: "FORBIDDEN", message: "No puedes acceder a esta tienda" } });
      }

      const [existing] = (await db
        .select({ id: storeProducts.id })
        .from(storeProducts)
        .where(and(eq(storeProducts.id, params.productId), eq(storeProducts.storeId, params.storeId)))
        .limit(1)) as Array<{ id: string }>;

      if (!existing) {
        return status(404, { error: { code: "NOT_FOUND", message: "Producto no encontrado" } });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.name !== undefined) updates.name = body.name;
      if (body.sku !== undefined) updates.sku = body.sku;
      if (body.cpgId !== undefined) updates.cpgId = body.cpgId;
      if (body.price !== undefined) updates.price = body.price.toString();
      if (body.status !== undefined) updates.status = body.status;

      const [updated] = (await db
        .update(storeProducts)
        .set(updates)
        .where(and(eq(storeProducts.id, params.productId), eq(storeProducts.storeId, params.storeId)))
        .returning()) as StoreProductRow[];

      if (!updated) {
        return status(500, {
          error: {
            code: "STORE_PRODUCT_UPDATE_FAILED",
            message: "No se pudo actualizar el producto",
          },
        });
      }

      return { data: serializeStoreProduct(updated) };
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      body: storeProductUpdateRequest,
      response: { 200: storeProductResponse },
      detail: { summary: "Actualizar producto de tienda" },
    },
  )
  .delete(
    "/:storeId/products/:productId",
    async ({
      auth,
      params,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string; productId: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, { error: { code: "FORBIDDEN", message: "No puedes acceder a esta tienda" } });
      }

      const [existing] = (await db
        .select({ id: storeProducts.id })
        .from(storeProducts)
        .where(and(eq(storeProducts.id, params.productId), eq(storeProducts.storeId, params.storeId)))
        .limit(1)) as Array<{ id: string }>;

      if (!existing) {
        return status(404, { error: { code: "NOT_FOUND", message: "Producto no encontrado" } });
      }

      await db
        .update(storeProducts)
        .set({ status: "inactive", updatedAt: new Date() })
        .where(and(eq(storeProducts.id, params.productId), eq(storeProducts.storeId, params.storeId)));

      return { data: { success: true } };
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      detail: { summary: "Desactivar producto de tienda" },
    },
  )
  // ========== STORE PRODUCT SEARCH ==========
  .get(
    "/:storeId/products-search",
    async ({
      auth,
      params,
      query,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string };
      query: { q: string; limit?: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, { error: { code: "FORBIDDEN", message: "No puedes acceder a esta tienda" } });
      }

      const limit = parseLimit(query.limit ?? "20");
      const searchTerm = '%' + query.q + '%';

      const storeProductsRows = (await db.execute(sql`
        select "id", "store_id", "product_id", "cpg_id", "name", "sku", "unit_type", "price", "stock", "status", "created_at"
        from "store_products"
        where "store_id" = ${params.storeId} and "status" = 'active' and "name" ILIKE ${searchTerm}
        order by "name"
        limit ${sql.raw(String(limit))}
      `)) as StoreProductRow[];

      const globalProductsRows = (await db.execute(sql`
        select p."id", p."brand_id", p."name", p."sku", b."cpg_id", c."name" as "cpg_name"
        from "products" p
        inner join "brands" b on p."brand_id" = b."id"
        inner join "cpgs" c on b."cpg_id" = c."id"
        where p."status" = 'active' and p."name" ILIKE ${searchTerm}
        order by p."name"
        limit ${sql.raw(String(limit))}
      `)) as Array<{
        id: string;
        brand_id: string;
        name: string;
        sku: string;
        cpg_id: string;
        cpg_name: string;
      }>;

      const storeProducts = storeProductsRows.map((row) => ({
        ...serializeStoreProduct(row),
        source: "store" as const,
      }));

      const globalProducts = globalProductsRows.map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        brandId: row.brand_id,
        cpgId: row.cpg_id,
        cpgName: row.cpg_name,
        source: "global" as const,
      }));

      return {
        data: {
          storeProducts,
          globalProducts,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      query: storeProductSearchQuery,
      detail: { summary: "Buscar productos en catálogo global y de tienda" },
    },
  )
  .post(
    "/:storeId/inventory/intake/preview",
    async ({
      auth,
      params,
      body,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string };
      body: { text: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, { error: { code: "FORBIDDEN", message: "No puedes acceder a esta tienda" } });
      }

      const rows = (await db.execute(sql`
        select "id", "store_id", "product_id", "cpg_id", "name", "sku", "unit_type", "price", "stock", "status", "created_at"
        from "store_products"
        where "store_id" = ${params.storeId}
        order by "name"
      `)) as StoreProductRow[];

      return {
        data: previewInventoryImport(body.text, rows.map(serializeStoreProduct)),
      };
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      body: inventoryIntakePreviewRequest,
      response: { 200: inventoryIntakePreviewResponse },
      detail: { summary: "Previsualizar carga de inventario por texto" },
    },
  )
  .post(
    "/:storeId/inventory/intake/confirm",
    async ({
      auth,
      params,
      body,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string };
      body: { rows: Array<{ lineNumber: number; rawText: string; name: string; sku?: string; quantity: number; price?: number; action: 'match_existing' | 'create_new'; storeProductId?: string }>; idempotencyKey?: string; notes?: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, { error: { code: "FORBIDDEN", message: "No puedes acceder a esta tienda" } });
      }

      for (const row of body.rows) {
        if (row.action === 'match_existing' && !row.storeProductId) {
          return status(400, {
            error: {
              code: 'INVALID_INVENTORY_ROW',
              message: `La fila ${row.lineNumber} debe apuntar a un producto existente.`,
            },
          });
        }

        if (row.action === 'create_new' && row.price === undefined) {
          return status(400, {
            error: {
              code: 'NEW_PRODUCT_PRICE_REQUIRED',
              message: `La fila ${row.lineNumber} necesita precio para crear un producto nuevo.`,
            },
          });
        }
      }

      const idempotencyKey = body.idempotencyKey?.trim() || `inventory-intake-${crypto.randomUUID()}`;
      const replayedMovements = (await db.execute(sql`
        select m."id", m."store_id", m."store_product_id", m."type", m."quantity_delta", m."balance_after", m."reference_type", m."reference_id", m."notes", m."created_at", m."metadata", sp."name" as "product_name", sp."sku"
        from "inventory_movements" m
        inner join "store_products" sp on sp."id" = m."store_product_id"
        where m."store_id" = ${params.storeId}
          and m."reference_type" = 'inventory_intake'
          and m."reference_id" = ${idempotencyKey}
        order by m."created_at", m."id"
      `)) as Array<InventoryMovementListRow & { metadata: string | null }>;

      if (replayedMovements.length > 0) {
        const rows = replayedMovements.map((row) => {
          let created = false;
          try {
            created = Boolean(row.metadata ? JSON.parse(row.metadata).created : false);
          } catch {
            created = false;
          }

          return {
            storeProductId: row.store_product_id,
            name: row.product_name,
            sku: row.sku ?? undefined,
            quantityDelta: row.quantity_delta,
            previousStock: row.balance_after - row.quantity_delta,
            currentStock: row.balance_after,
            created,
          };
        });

        return {
          data: {
            idempotencyKey,
            replayed: true,
            rows,
            summary: summarizeConfirmedInventoryRows(rows),
          },
        };
      }

      try {
        const appliedRows = await db.transaction(async (tx) => {
          const nextRows: Array<{ storeProductId: string; name: string; sku?: string; quantityDelta: number; previousStock: number; currentStock: number; created: boolean }> = [];

          for (const row of body.rows) {
            if (row.action === 'match_existing') {
              const [existing] = (await tx.execute(sql`
                select "id", "store_id", "product_id", "cpg_id", "name", "sku", "unit_type", "price", "stock", "status", "created_at"
                from "store_products"
                where "id" = ${row.storeProductId!} and "store_id" = ${params.storeId}
                for update
              `)) as StoreProductRow[];

              if (!existing) {
                throw new Error('STORE_PRODUCT_NOT_FOUND');
              }

              const [updated] = (await tx.execute(sql`
                update "store_products"
                set "stock" = "stock" + ${row.quantity}, "updated_at" = now()
                where "id" = ${row.storeProductId!} and "store_id" = ${params.storeId}
                returning "id", "store_id", "product_id", "cpg_id", "name", "sku", "unit_type", "price", "stock", "status", "created_at"
              `)) as StoreProductRow[];

              if (!updated) {
                throw new Error('STORE_PRODUCT_UPDATE_FAILED');
              }

              await tx.insert(inventoryMovements).values({
                storeId: params.storeId,
                storeProductId: updated.id,
                type: 'intake',
                quantityDelta: row.quantity,
                balanceAfter: updated.stock,
                referenceType: 'inventory_intake',
                referenceId: idempotencyKey,
                notes: body.notes ?? null,
                metadata: JSON.stringify({ lineNumber: row.lineNumber, rawText: row.rawText, action: row.action, created: false }),
              });

              nextRows.push({
                storeProductId: updated.id,
                name: updated.name,
                sku: updated.sku ?? undefined,
                quantityDelta: row.quantity,
                previousStock: existing.stock,
                currentStock: updated.stock,
                created: false,
              });

              continue;
            }

            const [createdProduct] = (await tx.insert(storeProducts).values({
              storeId: params.storeId,
              name: row.name,
              sku: row.sku ?? null,
              price: row.price!.toString(),
              stock: row.quantity,
            }).returning()) as StoreProductRow[];

            if (!createdProduct) {
              throw new Error('STORE_PRODUCT_CREATE_FAILED');
            }

            await tx.insert(inventoryMovements).values({
              storeId: params.storeId,
              storeProductId: createdProduct.id,
              type: 'intake',
              quantityDelta: row.quantity,
              balanceAfter: createdProduct.stock,
              referenceType: 'inventory_intake',
              referenceId: idempotencyKey,
              notes: body.notes ?? null,
              metadata: JSON.stringify({ lineNumber: row.lineNumber, rawText: row.rawText, action: row.action, created: true }),
            });

            nextRows.push({
              storeProductId: createdProduct.id,
              name: createdProduct.name,
              sku: createdProduct.sku ?? undefined,
              quantityDelta: row.quantity,
              previousStock: 0,
              currentStock: createdProduct.stock,
              created: true,
            });
          }

          return nextRows;
        });

        return {
          data: {
            idempotencyKey,
            replayed: false,
            rows: appliedRows,
            summary: summarizeConfirmedInventoryRows(appliedRows),
          },
        };
      } catch (error) {
        if (error instanceof Error && error.message === 'STORE_PRODUCT_NOT_FOUND') {
          return status(404, {
            error: {
              code: 'STORE_PRODUCT_NOT_FOUND',
              message: 'Uno de los productos seleccionados ya no existe.',
            },
          });
        }

        if (error instanceof Error && error.message === 'STORE_PRODUCT_UPDATE_FAILED') {
          return status(500, {
            error: {
              code: 'STORE_PRODUCT_UPDATE_FAILED',
              message: 'No se pudo actualizar el inventario del producto existente.',
            },
          });
        }

        if (error instanceof Error && error.message === 'STORE_PRODUCT_CREATE_FAILED') {
          return status(500, {
            error: {
              code: 'STORE_PRODUCT_CREATE_FAILED',
              message: 'No se pudo crear uno de los productos nuevos del inventario.',
            },
          });
        }

        return status(500, {
          error: {
            code: 'INVENTORY_CONFIRM_FAILED',
            message: 'No se pudo aplicar la carga de inventario.',
          },
        });
      }
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      body: inventoryIntakeConfirmRequest,
      response: { 200: inventoryIntakeConfirmResponse },
      detail: { summary: "Confirmar carga de inventario" },
    },
  )
  .get(
    "/:storeId/inventory/movements",
    async ({
      auth,
      params,
      query,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string };
      query: { limit?: string; cursor?: string; storeProductId?: string; type?: 'intake' | 'sale' | 'adjustment' };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, { error: { code: "FORBIDDEN", message: "No puedes acceder a esta tienda" } });
      }

      const cursorDate = parseCursor(query.cursor);
      const limit = parseLimit(query.limit ?? '50');
      const safeLimit = Math.trunc(limit) + 1;
      const filters = [sql`m."store_id" = ${params.storeId}`];

      if (query.storeProductId) {
        filters.push(sql`m."store_product_id" = ${query.storeProductId}`);
      }
      if (query.type) {
        filters.push(sql`m."type" = ${query.type}`);
      }
      if (cursorDate) {
        filters.push(sql`m."created_at" < ${cursorDate}`);
      }

      const whereClause = sql`where ${sql.join(filters, sql` and `)}`;
      const rows = (await db.execute(sql`
        select m."id", m."store_id", m."store_product_id", m."type", m."quantity_delta", m."balance_after", m."reference_type", m."reference_id", m."notes", m."created_at", sp."name" as "product_name", sp."sku"
        from "inventory_movements" m
        inner join "store_products" sp on sp."id" = m."store_product_id"
        ${whereClause}
        order by m."created_at" desc, m."id" desc
        limit ${sql.raw(String(safeLimit))}
      `)) as InventoryMovementListRow[];

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.created_at.toISOString() : null;

      return {
        data: items.map(serializeInventoryMovement),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      query: inventoryMovementListQuery,
      response: { 200: inventoryMovementListResponse },
      detail: { summary: "Listar movimientos de inventario" },
    },
  )
  // ========== STORE BRANDS (all brands - not filtered by CPG relations) ==========
  .get(
    "/:storeId/brands",
    async ({
      auth,
      params,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, { error: { code: "FORBIDDEN", message: "No puedes acceder a esta tienda" } });
      }

      const brandsRows = (await db.execute(sql`
        select "id", "cpg_id", "name", "logo_url", "status", "created_at"
        from "brands"
        where "status" = 'active'
        order by "name"
      `)) as Array<{
        id: string;
        cpg_id: string;
        name: string;
        logo_url: string | null;
        status: string;
        created_at: Date;
      }>;

      return {
        data: brandsRows.map((row) => ({
          id: row.id,
          cpgId: row.cpg_id,
          name: row.name,
          logoUrl: row.logo_url ?? undefined,
          status: row.status,
        })),
      };
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      response: { 200: storeBrandListResponse },
      detail: { summary: "Listar marcas disponibles para la tienda" },
    },
  )
  .post(
    "/:storeId/customer-resolve",
    async ({
      auth,
      params,
      body,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string };
      body: { input: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, { error: { code: "FORBIDDEN", message: "No puedes acceder a esta tienda" } });
      }

      const parsed = parseCardLookupInput(body.input);
      if (!parsed) {
        return status(400, { error: { code: "INVALID_ARGUMENT", message: "Código de tarjeta o teléfono inválido" } });
      }

      if (parsed.kind === "phone") {
        try {
          const resolved = await resolveCustomerByPhone(parsed.value, params.storeId);
          return {
            data: {
              userId: resolved.userId,
              cardId: resolved.cardId,
              cardCode: resolved.cardCode,
              name: resolved.name,
              phone: resolved.phone,
              email: resolved.email,
            },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message === "INVALID_PHONE_FORMAT") {
            return status(400, {
              error: {
                code: "INVALID_PHONE_FORMAT",
                message: "El formato del teléfono no es válido. Usa 10 dígitos o formato internacional (+52...).",
              },
            });
          }
          if (message === "USER_ROLE_NOT_ALLOWED") {
            return status(403, {
              error: {
                code: "USER_ROLE_NOT_ALLOWED",
                message: "Este teléfono pertenece a una cuenta que no puede usarse en el POS.",
              },
            });
          }
          return status(404, {
            error: { code: "CUSTOMER_NOT_FOUND", message: "No pudimos registrar al cliente. Intenta de nuevo." },
          });
        }
      }

      const [resolved] = (await db
        .select({
          cardId: cards.id,
          cardCode: cards.code,
          userId: cards.userId,
          name: users.name,
          phone: users.phone,
          email: users.email,
        })
        .from(cards)
        .innerJoin(users, eq(users.id, cards.userId))
        .where(parsed.kind === "cardId" ? eq(cards.id, parsed.value) : eq(cards.code, parsed.value))
        .limit(1)) as Array<{
        cardId: string;
        cardCode: string;
        userId: string;
        name: string | null;
        phone: string;
        email: string | null;
      }>;

      if (!resolved) {
        return status(404, { error: { code: "CARD_NOT_FOUND", message: "Tarjeta no encontrada" } });
      }

      return {
        data: {
          userId: resolved.userId,
          cardId: resolved.cardId,
          cardCode: resolved.cardCode,
          name: resolved.name ?? undefined,
          phone: resolved.phone,
          email: resolved.email ?? undefined,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      body: storeCustomerResolveRequest,
      response: { 200: storeCustomerResolveResponse },
      detail: { summary: "Resolver cliente por QR o código de tarjeta" },
    },
  )
  // ========== STORE TRANSACTIONS ==========
  .post(
    "/:storeId/transactions",
    async ({
      auth,
      params,
      body,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string };
      body: { userId?: string; cardId?: string; items: Array<{ storeProductId: string; quantity: number; amount: number }>; idempotencyKey?: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, { error: { code: "FORBIDDEN", message: "No puedes acceder a esta tienda" } });
      }

      if (!body.items || body.items.length === 0) {
        return status(400, { error: { code: "INVALID_ARGUMENT", message: "Debes enviar al menos un item" } });
      }

      let resolvedCustomer:
        | {
            userId: string;
            cardId?: string;
            cardCode?: string;
            name?: string;
            phone: string;
            email?: string;
          }
        | null = null;

      if (body.userId || body.cardId) {
        if (body.cardId) {
          const [customerByCard] = (await db
            .select({
              userId: users.id,
              cardId: cards.id,
              cardCode: cards.code,
              name: users.name,
              phone: users.phone,
              email: users.email,
            })
            .from(cards)
            .innerJoin(users, eq(users.id, cards.userId))
            .where(eq(cards.id, body.cardId))
            .limit(1)) as Array<{
            userId: string;
            cardId: string;
            cardCode: string;
            name: string | null;
            phone: string;
            email: string | null;
          }>;

          if (!customerByCard) {
            return status(404, { error: { code: "CARD_NOT_FOUND", message: "Tarjeta no encontrada" } });
          }

          if (body.userId && customerByCard.userId !== body.userId) {
            return status(400, { error: { code: "CARD_USER_MISMATCH", message: "La tarjeta no pertenece al usuario indicado" } });
          }

          resolvedCustomer = {
            userId: customerByCard.userId,
            cardId: customerByCard.cardId,
            cardCode: customerByCard.cardCode,
            name: customerByCard.name ?? undefined,
            phone: customerByCard.phone,
            email: customerByCard.email ?? undefined,
          };
        } else if (body.userId) {
          const [customerByUser] = (await db
            .select({
              userId: users.id,
              name: users.name,
              phone: users.phone,
              email: users.email,
            })
            .from(users)
            .where(eq(users.id, body.userId))
            .limit(1)) as Array<{
            userId: string;
            name: string | null;
            phone: string;
            email: string | null;
          }>;

          if (!customerByUser) {
            return status(404, { error: { code: "USER_NOT_FOUND", message: "Usuario no encontrado" } });
          }

          resolvedCustomer = {
            userId: customerByUser.userId,
            name: customerByUser.name ?? undefined,
            phone: customerByUser.phone,
            email: customerByUser.email ?? undefined,
          };
        }
      }

      const storeProductIds = body.items.map((item) => item.storeProductId);
      const storeProductsRows = (await db
        .select()
        .from(storeProducts)
        .where(and(or(...storeProductIds.map((id) => eq(storeProducts.id, id))), eq(storeProducts.storeId, params.storeId)))) as Array<{
        id: string;
        productId: string | null;
        cpgId: string | null;
        name: string;
        sku: string | null;
        price: string;
        stock: number;
        status: string;
      }>;

      const storeProductMap = new Map(storeProductsRows.map((sp) => [sp.id, sp]));

      for (const item of body.items) {
        if (!storeProductMap.has(item.storeProductId)) {
          return status(404, { error: { code: "PRODUCT_NOT_FOUND", message: `Producto ${item.storeProductId} no encontrado` } });
        }

        const storeProduct = storeProductMap.get(item.storeProductId)!;
        if (storeProduct.status !== 'active') {
          console.warn(`[transactions] PRODUCT_INACTIVE storeId=${params.storeId} productId=${storeProduct.id} name="${storeProduct.name}"`);
          return status(409, {
            error: {
              code: 'PRODUCT_INACTIVE',
              message: `El producto ${storeProduct.name} está inactivo y no puede venderse.`,
            },
          });
        }

        if (storeProduct.stock < item.quantity) {
          console.warn(`[transactions] OUT_OF_STOCK storeId=${params.storeId} productId=${storeProduct.id} name="${storeProduct.name}" requested=${item.quantity} available=${storeProduct.stock}`);
          return status(409, {
            error: {
              code: 'OUT_OF_STOCK',
              message: `No hay suficiente inventario para ${storeProduct.name}. Disponible: ${storeProduct.stock}.`,
            },
          });
        }
      }

      let outcome: Awaited<ReturnType<typeof createStorePosTransaction>> | null = null;

      try {
        outcome = await db.transaction(async (tx) => {
          const nextOutcome = await createStorePosTransaction({
            storeId: params.storeId,
            userId: resolvedCustomer?.userId,
            cardId: resolvedCustomer?.cardId,
            idempotencyKey: body.idempotencyKey,
            items: body.items.map((item) => {
              const storeProduct = storeProductMap.get(item.storeProductId)!;
              return {
                storeProductId: item.storeProductId,
                productId: storeProduct.productId ?? undefined,
                name: storeProduct.name,
                quantity: item.quantity,
                amount: item.amount,
              };
            }),
          }, tx);

          if (!nextOutcome || nextOutcome.statusCode === 200) {
            return nextOutcome;
          }

          for (const item of body.items) {
            const storeProduct = storeProductMap.get(item.storeProductId)!;
            const [updated] = (await tx.execute(sql`
              update "store_products"
              set "stock" = "stock" - ${item.quantity}, "updated_at" = now()
              where "id" = ${item.storeProductId}
                and "store_id" = ${params.storeId}
                and "stock" >= ${item.quantity}
              returning "id", "store_id", "product_id", "cpg_id", "name", "sku", "unit_type", "price", "stock", "status", "created_at"
            `)) as StoreProductRow[];

            if (!updated) {
              throw new Error('OUT_OF_STOCK_RACE');
            }

            await tx.insert(inventoryMovements).values({
              storeId: params.storeId,
              storeProductId: updated.id,
              type: 'sale',
              quantityDelta: item.quantity * -1,
              balanceAfter: updated.stock,
              referenceType: 'transaction',
              referenceId: nextOutcome.transaction.id,
              notes: `Venta POS: ${storeProduct.name}`,
              metadata: JSON.stringify({ quantity: item.quantity, amount: item.amount }),
            });

            storeProductMap.set(updated.id, {
              ...storeProduct,
              stock: updated.stock,
            });
          }

          return nextOutcome;
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'OUT_OF_STOCK_RACE') {
          console.warn(`[transactions] OUT_OF_STOCK_RACE storeId=${params.storeId}`);
          return status(409, {
            error: {
              code: 'OUT_OF_STOCK',
              message: 'El inventario cambió mientras se registraba la venta. Revisa el stock e intenta de nuevo.',
            },
          });
        }

        console.error(`[transactions] unexpected error storeId=${params.storeId}`, error);
        throw error;
      }

      if (!outcome) {
        return status(500, {
          error: {
            code: "TRANSACTION_CREATE_FAILED",
            message: "No se pudo crear la transacción",
          },
        });
      }

      const itemResponses = outcome.items.map((item) => {
        const metadata = parseStoreTransactionItemMetadata(item.metadata);
        const storeProduct = metadata?.storeProductId ? storeProductMap.get(metadata.storeProductId) : undefined;
        return {
          id: item.id,
          storeProductId: metadata?.storeProductId ?? item.productId,
          productId: storeProduct?.productId ?? undefined,
          name: metadata?.displayName ?? storeProduct?.name ?? item.productId,
          quantity: item.quantity,
          amount: item.amount,
        };
      });

      return status(outcome.statusCode, {
        data: {
          ...toDetailPayload(outcome.transaction, outcome.items, outcome.accumulations),
          items: itemResponses,
          guestFlag: !outcome.transaction.userId,
          ...(resolvedCustomer ? { customer: resolvedCustomer } : {}),
        },
      });
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      body: storeTransactionCreateRequest,
      response: { 200: storeTransactionResponse, 201: storeTransactionResponse },
      detail: { summary: "Registrar transacción desde POS" },
    },
  )
  .get(
    "/:storeId/transactions",
    async ({
      auth,
      params,
      query,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string };
      query: { limit?: string; cursor?: string; from?: string; to?: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, { error: { code: "FORBIDDEN", message: "No puedes acceder a esta tienda" } });
      }

      const cursorDate = parseCursor(query.cursor);
      const limit = parseLimit(query.limit);
      const safeLimit = Math.trunc(limit) + 1;

      const filters = [sql`"transactions"."store_id" = ${params.storeId}`];

      if (query.from) {
        filters.push(sql`"transactions"."created_at" >= ${query.from}`);
      }
      if (query.to) {
        filters.push(sql`"transactions"."created_at" <= ${query.to}`);
      }
      if (cursorDate) {
        filters.push(sql`"transactions"."created_at" < ${cursorDate}`);
      }

      const whereClause = filters.length > 0 ? sql`where ${sql.join(filters, sql` and `)}` : sql``;

      const txRows = (await db.execute(sql`
        select "id", "user_id", "store_id", "card_id", "total_amount", "created_at"
        from "transactions"
        ${whereClause}
        order by "transactions"."created_at" desc
        limit ${sql.raw(String(safeLimit))}
      `)) as Array<{
        id: string;
        user_id: string | null;
        store_id: string;
        card_id: string | null;
        total_amount: number;
        created_at: Date;
      }>;

      const hasMore = txRows.length > limit;
      const txs = hasMore ? txRows.slice(0, limit) : txRows;
      const nextCursor = hasMore ? txs[txs.length - 1]?.created_at.toISOString() : null;

      const txIds = txs.map((tx) => tx.id);
      const itemsRows = txIds.length > 0
        ? (await db.execute(sql`
            select "id", "transaction_id", "product_id", "quantity", "amount", "metadata"
            from "transaction_items"
            where "transaction_id" = any(${txIds})
          `)) as Array<{
            id: string;
            transaction_id: string;
            product_id: string;
            quantity: number;
            amount: number;
            metadata: string | null;
          }>
        : [];

      const itemsByTx = new Map<string, typeof itemsRows>();
      for (const item of itemsRows) {
        if (!itemsByTx.has(item.transaction_id)) {
          itemsByTx.set(item.transaction_id, []);
        }
        itemsByTx.get(item.transaction_id)!.push(item);
      }

      const storeProductsMap = new Map<string, { name: string; storeProductId?: string; productId?: string }>();
      if (itemsRows.length > 0) {
        const productIds = [...new Set(itemsRows.map((i) => i.product_id))];
        const storeProductsData = (await db
          .select({ id: storeProducts.id, name: storeProducts.name, productId: storeProducts.productId })
          .from(storeProducts)
          .where(or(...productIds.map((id) => eq(storeProducts.id, id)))) as any) as Array<{ id: string; name: string; productId: string | null }>;
        for (const sp of storeProductsData) {
          storeProductsMap.set(sp.id, { name: sp.name, storeProductId: sp.id, productId: sp.productId ?? undefined });
        }
      }

      return {
        data: txs.map((tx) => {
          const txItems = itemsByTx.get(tx.id) ?? [];
          return {
            id: tx.id,
            userId: tx.user_id ?? undefined,
            storeId: tx.store_id,
            cardId: tx.card_id ?? undefined,
            items: txItems.map((item) => {
              const metadata = parseStoreTransactionItemMetadata(item.metadata);
              const spInfo = metadata?.storeProductId ? storeProductsMap.get(metadata.storeProductId) : storeProductsMap.get(item.product_id);
              return {
                id: item.id,
                storeProductId: metadata?.storeProductId ?? spInfo?.storeProductId ?? item.product_id,
                productId: spInfo?.productId ?? (spInfo ? undefined : item.product_id),
                name: metadata?.displayName ?? spInfo?.name ?? item.product_id,
                quantity: item.quantity,
                amount: item.amount,
              };
            }),
            totalAmount: tx.total_amount,
            guestFlag: !tx.user_id,
            accumulations: [],
            createdAt: tx.created_at.toISOString(),
          };
        }),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      query: storeTransactionListQuery,
      response: { 200: storeTransactionListResponse },
      detail: { summary: "Listar transacciones de tienda" },
    },
  )
  .get(
    "/:storeId/checkins",
    async ({ auth, params, query, status }: {
      auth: AuthContext | null;
      params: { storeId: string };
      query: { status?: string; limit?: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      const limit = parseLimit(query.limit);
      const statusFilter = query.status;
      const rows = await findPendingCheckinsForStore(params.storeId, { status: statusFilter as 'pending' | undefined, limit });

      const userIds = [...new Set(rows.map((r) => r.userId))];
      const userRows = (userIds.length > 0
        ? await db.select({ id: users.id, name: users.name, phone: users.phone }).from(users).where(or(...userIds.map((id) => eq(users.id, id))))
        : []) as Array<{ id: string; name: string | null; phone: string | null }>;
      const userById = new Map(userRows.map((u) => [u.id, u]));

      return {
        data: rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          userName: userById.get(row.userId)?.name ?? undefined,
          userPhone: userById.get(row.userId)?.phone ?? undefined,
          status: row.status,
          checkedInAt: row.checkedInAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          matchedTransactionId: row.matchedTransactionId ?? undefined,
        })),
      };
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      params: t.Object({ storeId: t.String() }),
      query: t.Object({ status: t.Optional(t.String()), limit: t.Optional(t.String()) }),
      response: { 200: t.Object({ data: t.Array(t.Object({
        id: t.String(),
        userId: t.String(),
        userName: t.Optional(t.String()),
        userPhone: t.Optional(t.String()),
        status: t.String(),
        checkedInAt: t.String(),
        expiresAt: t.String(),
        matchedTransactionId: t.Optional(t.String()),
      })) }) },
      detail: { summary: "Listar check-ins de tienda" },
    },
  )
  .post(
    "/:storeId/checkins/:checkinId/match",
    async ({ auth, params, body, status }: {
      auth: AuthContext | null;
      params: { storeId: string; checkinId: string };
      body: { transactionId: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      try {
        await matchCheckinWithTransaction(params.checkinId, body.transactionId);
        return { data: { matched: true } };
      } catch {
        return status(404, { error: { code: "CHECKIN_NOT_FOUND", message: "Check-in no encontrado" } });
      }
    },
    {
      beforeHandle: authGuard({ roles: ["store_admin", "store_staff"], allowApiKey: true }),
      params: t.Object({ storeId: t.String(), checkinId: t.String() }),
      body: t.Object({ transactionId: t.String() }),
      response: { 200: t.Object({ data: t.Object({ matched: t.Boolean() }) }) },
      detail: { summary: "Emparejar check-in con transacción" },
    },
  );
