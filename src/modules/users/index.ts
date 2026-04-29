import { and, desc, eq, lt, ne, or, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { authGuard, authPlugin, type AuthContext } from "../../app/plugins/auth";
import { isUserAuth } from "../../app/plugins/permissions";
import { allUserRoles, backofficeRoles } from "../../app/plugins/roles";
import { authorizationHeader } from "../../app/plugins/schemas";
import { parseCursor, parseLimit } from "../../app/utils/pagination";
import { db } from "../../db/client";
import {
  balances,
  campaignBalances,
  campaignSubscriptions,
  campaigns,
  campaignTiers,
  cards,
  tierBenefits,
  users,
} from "../../db/schema";
import { ensureUserUniversalWalletCard } from "../../services/wallet-onboarding";
import type { StatusHandler } from "../../types/handlers";
import { serializeCard, type CardRow } from "../cards";
import { cardListQuery, cardListResponse } from "../cards/model";
import {
  adminCreateUserRequest,
  adminCreateUserResponse,
  blockUserRequest,
  blockUserResponse,
  userListQuery,
  userListResponse,
  userMeResponse,
  userWalletResponse,
  userMeUpdateRequest,
} from "./model";

const allowedRoles = allUserRoles;
const backofficeAdminRoles = ["qoa_admin"] as const;
const temporaryPasswordLength = 14;

type UserListQuery = {
  limit?: string;
  offset?: string;
  role?: string;
  status?: string;
};

type UserListRow = {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  role: string;
  status: string;
  tenantId: string | null;
  tenantType: string | null;
  createdAt: Date;
};

type AdminCreateBody = {
  phone: string;
  email?: string;
  name?: string;
  role:
    | "consumer"
    | "customer"
    | "store_staff"
    | "store_admin"
    | "cpg_admin"
    | "qoa_support"
    | "qoa_admin";
  password?: string;
  tenantId?: string;
  tenantType?: "cpg" | "store";
};

type UserParams = {
  id: string;
};

type BlockUserBody = {
  until?: string;
  reason?: string;
};

type CardListQueryParams = {
  limit?: string;
  cursor?: string;
};

type UserMeUpdateBody = {
  name?: string;
  email?: string;
};

type ListUsersContext = {
  query: UserListQuery;
  status: StatusHandler;
};

type CreateUserContext = {
  body: AdminCreateBody;
  status: StatusHandler;
};

type BlockUserContext = {
  params: UserParams;
  body: BlockUserBody;
  status: StatusHandler;
};

type UserParamsContext = {
  params: UserParams;
  status: StatusHandler;
};

type UserCardsContext = {
  auth: AuthContext | null;
  query: CardListQueryParams;
  status: StatusHandler;
};

type UserMeContext = {
  auth: AuthContext | null;
  status: StatusHandler;
};

type UserMeWalletContext = {
  auth: AuthContext | null;
  status: StatusHandler;
};

type UserMeUpdateContext = {
  auth: AuthContext | null;
  body: UserMeUpdateBody;
  status: StatusHandler;
};

const generateTemporaryPassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let value = "";
  for (let i = 0; i < temporaryPasswordLength; i += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
};

export const usersModule = new Elysia({
  prefix: "/users",
  detail: {
    tags: ["Users"],
  },
})
  .use(authPlugin)
  .get(
    "/",
    async ({ query, status }: ListUsersContext) => {
      const limit = Math.min(Math.max(Number(query.limit ?? 25), 1), 100);
      const offset = Math.max(Number(query.offset ?? 0), 0);

      const whereClauses = [];
      if (query.role) {
        whereClauses.push(eq(users.role, query.role));
      }
      if (query.status) {
        whereClauses.push(eq(users.status, query.status));
      }

      const whereClause = whereClauses.length ? and(...whereClauses) : undefined;

      let listQuery = db
        .select({
          id: users.id,
          phone: users.phone,
          email: users.email,
          name: users.name,
          role: users.role,
          status: users.status,
          tenantId: users.tenantId,
          tenantType: users.tenantType,
          createdAt: users.createdAt,
        })
        .from(users);

      if (whereClause) {
        listQuery = listQuery.where(whereClause);
      }

      const rows = (await listQuery
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset)) as UserListRow[];

      let countQuery = db.select({ total: sql<number>`count(*)` }).from(users);
      if (whereClause) {
        countQuery = countQuery.where(whereClause);
      }

      const [{ total } = { total: 0 }] = (await countQuery) as Array<{ total: number }>;

      return {
        data: rows.map((user: UserListRow) => ({
          ...user,
          phone: user.phone ?? undefined,
          email: user.email ?? undefined,
          name: user.name ?? undefined,
          tenantId: user.tenantId ?? undefined,
          tenantType: user.tenantType ?? undefined,
          createdAt: user.createdAt.toISOString(),
        })),
        meta: {
          total,
          limit,
          offset,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...backofficeRoles] }),
      headers: authorizationHeader,
      query: userListQuery,
      response: {
        200: userListResponse,
      },
      detail: {
        summary: "Listar usuarios para backoffice",
        security: [{ bearerAuth: [] }],
      },
    },
  )
  .post(
    "/",
    async ({ body, status }: CreateUserContext) => {
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
            code: "USER_EXISTS",
            message: "El usuario ya existe",
          },
        });
      }

      // Validar coherencia rol/tenant
      const requiresTenant = ["store_staff", "store_admin", "cpg_admin"].includes(body.role);
      if (requiresTenant && (!body.tenantId || !body.tenantType)) {
        return status(400, {
          error: {
            code: "TENANT_REQUIRED",
            message: "Este rol requiere tenantId y tenantType",
          },
        });
      }

      if (!requiresTenant && (body.tenantId || body.tenantType)) {
        return status(400, {
          error: {
            code: "TENANT_NOT_ALLOWED",
            message: "Este rol no puede tener tenant",
          },
        });
      }

      if (body.role === "cpg_admin" && body.tenantType !== "cpg") {
        return status(400, {
          error: {
            code: "INVALID_TENANT_TYPE",
            message: "cpg_admin requiere tenantType = cpg",
          },
        });
      }

      if (["store_staff", "store_admin"].includes(body.role) && body.tenantType !== "store") {
        return status(400, {
          error: {
            code: "INVALID_TENANT_TYPE",
            message: "store_staff/store_admin requiere tenantType = store",
          },
        });
      }

      const temporaryPassword = body.password ?? generateTemporaryPassword();
      const passwordHash = await Bun.password.hash(temporaryPassword);

      const [created] = (await db
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
        })) as Array<{
        id: string;
        phone: string;
        email: string | null;
        name: string | null;
        role: string;
        status: string;
        tenantId: string | null;
        tenantType: "cpg" | "store" | null;
      }>;

      if (!created) {
        return status(500, {
          error: {
            code: "USER_CREATE_FAILED",
            message: "No se pudo crear el usuario",
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
      beforeHandle: authGuard({ roles: [...backofficeAdminRoles] }),
      headers: authorizationHeader,
      body: adminCreateUserRequest,
      response: {
        200: adminCreateUserResponse,
      },
      detail: {
        summary: "Crear usuario desde backoffice",
        security: [{ bearerAuth: [] }],
      },
    },
  )
  .post(
    "/:id/block",
    async ({ params, body, status }: BlockUserContext) => {
      const untilDate = body.until ? new Date(body.until) : null;
      if (body.until && Number.isNaN(untilDate?.getTime())) {
        return status(400, {
          error: {
            code: "INVALID_ARGUMENT",
            message: "Fecha de bloqueo inválida",
          },
        });
      }

      if (untilDate && untilDate.getTime() <= Date.now()) {
        return status(400, {
          error: {
            code: "INVALID_ARGUMENT",
            message: "La fecha de bloqueo debe ser futura",
          },
        });
      }

      const [updated] = (await db
        .update(users)
        .set({
          status: untilDate ? "active" : "suspended",
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
        })) as Array<{
        id: string;
        status: string;
        blockedUntil: Date | null;
        blockedReason: string | null;
      }>;

      if (!updated) {
        return status(404, {
          error: {
            code: "USER_NOT_FOUND",
            message: "Usuario no encontrado",
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
      beforeHandle: authGuard({ roles: [...backofficeRoles] }),
      headers: authorizationHeader,
      body: blockUserRequest,
      response: {
        200: blockUserResponse,
      },
      detail: {
        summary: "Bloquear usuario (temporal o permanente)",
        security: [{ bearerAuth: [] }],
      },
    },
  )
  .post(
    "/:id/unblock",
    async ({ params, status }: UserParamsContext) => {
      const [updated] = (await db
        .update(users)
        .set({
          status: "active",
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
        })) as Array<{
        id: string;
        status: string;
        blockedUntil: Date | null;
        blockedReason: string | null;
      }>;

      if (!updated) {
        return status(404, {
          error: {
            code: "USER_NOT_FOUND",
            message: "Usuario no encontrado",
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
      beforeHandle: authGuard({ roles: [...backofficeRoles] }),
      headers: authorizationHeader,
      response: {
        200: blockUserResponse,
      },
      detail: {
        summary: "Desbloquear usuario",
        security: [{ bearerAuth: [] }],
      },
    },
  )
  .get(
    "/me/cards",
    async ({ auth, query, status }: UserCardsContext) => {
      if (!auth || !isUserAuth(auth)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "Token de usuario requerido",
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
      let queryBuilder = db.select().from(cards);
      if (cursorDate) {
        queryBuilder = queryBuilder.where(
          and(eq(cards.userId, auth.userId), lt(cards.createdAt, cursorDate)),
        );
      } else {
        queryBuilder = queryBuilder.where(eq(cards.userId, auth.userId));
      }

      const results = (await queryBuilder
        .orderBy(desc(cards.createdAt), desc(cards.id))
        .limit(limit + 1)) as CardRow[];
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
      beforeHandle: authGuard({ roles: [...allowedRoles] }),
      query: cardListQuery,
      response: {
        200: cardListResponse,
      },
      detail: {
        summary: "Listar mis tarjetas",
      },
    },
  )
  .get(
    "/me/wallet",
    async ({ auth, status }: UserMeWalletContext) => {
      if (!auth || !isUserAuth(auth)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "Token de usuario requerido",
          },
        });
      }

      const { cardId } = await ensureUserUniversalWalletCard(auth.userId);

      const [card] = (await db
        .select({
          id: cards.id,
          campaignId: cards.campaignId,
          code: cards.code,
          currentTierId: cards.currentTierId,
          tierGraceUntil: cards.tierGraceUntil,
          tierLastEvaluatedAt: cards.tierLastEvaluatedAt,
          status: cards.status,
          createdAt: cards.createdAt,
        })
        .from(cards)
        .where(eq(cards.id, cardId))) as Array<{
        id: string;
        campaignId: string;
        code: string;
        currentTierId: string | null;
        tierGraceUntil: Date | null;
        tierLastEvaluatedAt: Date | null;
        status: string;
        createdAt: Date;
      }>;

      if (!card) {
        return status(404, {
          error: {
            code: "CARD_NOT_FOUND",
            message: "Tarjeta no encontrada",
          },
        });
      }

      const [totalBalance] = (await db
        .select({ current: balances.current, lifetime: balances.lifetime })
        .from(balances)
        .where(eq(balances.cardId, card.id))) as Array<{ current: number; lifetime: number }>;

      const campaignRows = (await db.execute(sql`
        select
          c.id as "campaignId",
          c.name as "campaignName",
          c.enrollment_mode as "enrollmentMode",
          cs.status as "subscriptionStatus",
          cb.current,
          cb.lifetime
        from campaign_subscriptions cs
        inner join campaigns c on c.id = cs.campaign_id
        left join campaign_balances cb on cb.campaign_id = cs.campaign_id and cb.card_id = ${card.id}
        where cs.user_id = ${auth.userId}
          and cs.status = 'subscribed'
        order by cb.current desc nulls last, c.created_at desc, c.id desc
      `)) as Array<{
        campaignId: string;
        campaignName: string;
        enrollmentMode: "open" | "opt_in" | "system_universal";
        subscriptionStatus: string | null;
        current: number | null;
        lifetime: number | null;
      }>;

      const storeActivityRows = (await db.execute(sql`
        select
          s.id as "storeId",
          s.name as "storeName",
          count(t.id)::int as "purchases",
          coalesce(sum(t.total_amount), 0)::int as "totalSpent",
          max(t.created_at) as "lastPurchaseAt"
        from transactions t
        inner join stores s on s.id = t.store_id
        where t.user_id = ${auth.userId}
        group by s.id, s.name
        order by max(t.created_at) desc nulls last, s.name asc
      `)) as Array<{
        storeId: string;
        storeName: string;
        purchases: number;
        totalSpent: number;
        lastPurchaseAt: Date | null;
      }>;

      const storeCampaignPointRows = (await db.execute(sql`
        select
          t.store_id as "storeId",
          c.id as "campaignId",
          c.name as "campaignName",
          coalesce(sum(a.amount), 0)::int as "points"
        from transactions t
        inner join transaction_items ti on ti.transaction_id = t.id
        inner join accumulations a on a.transaction_item_id = ti.id and a.card_id = ${card.id}
        inner join campaigns c on c.id = a.campaign_id
        where t.user_id = ${auth.userId}
        group by t.store_id, c.id, c.name
        order by c.name asc
      `)) as Array<{
        storeId: string;
        campaignId: string;
        campaignName: string;
        points: number;
      }>;

      const storeCheckinRows = (await db.execute(sql`
        select
          sc.store_id as "storeId",
          s.name as "storeName",
          count(*)::int as "visits"
        from store_checkins sc
        inner join stores s on s.id = sc.store_id
        where sc.user_id = ${auth.userId}
        group by sc.store_id, s.name
      `)) as Array<{ storeId: string; storeName: string; visits: number }>;

      const campaignPointsByStore = new Map<
        string,
        Array<{ campaignId: string; campaignName: string; points: number }>
      >();
      for (const row of storeCampaignPointRows) {
        const current = campaignPointsByStore.get(row.storeId) ?? [];
        current.push({
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          points: row.points,
        });
        campaignPointsByStore.set(row.storeId, current);
      }

      const visitsByStore = new Map(storeCheckinRows.map((row) => [row.storeId, row]));
      const storeActivityById = new Map(
        storeActivityRows.map((row) => {
          const campaignPoints = campaignPointsByStore.get(row.storeId) ?? [];
          return [
            row.storeId,
            {
              storeId: row.storeId,
              storeName: row.storeName,
              purchases: row.purchases,
              visits: visitsByStore.get(row.storeId)?.visits ?? 0,
              totalSpent: row.totalSpent,
              pointsTotal: campaignPoints.reduce((sum, entry) => sum + entry.points, 0),
              lastPurchaseAt: row.lastPurchaseAt ? row.lastPurchaseAt.toISOString() : undefined,
              campaignPoints,
            },
          ] as const;
        }),
      );

      for (const row of storeCheckinRows) {
        if (storeActivityById.has(row.storeId)) {
          continue;
        }

        storeActivityById.set(row.storeId, {
          storeId: row.storeId,
          storeName: row.storeName,
          purchases: 0,
          visits: row.visits,
          totalSpent: 0,
          pointsTotal: 0,
          lastPurchaseAt: undefined,
          campaignPoints: [],
        });
      }

      const [currentTier] = card.currentTierId
        ? ((await db
            .select()
            .from(campaignTiers)
            .where(eq(campaignTiers.id, card.currentTierId))) as Array<{
            id: string;
            name: string;
            order: number;
            thresholdValue: number;
            windowUnit: "day" | "month" | "year";
            windowValue: number;
            minPurchaseCount: number | null;
            minPurchaseAmount: number | null;
            qualificationMode: "any" | "all";
            graceDays: number;
          }>)
        : [];

      const tierBenefitRows = currentTier
        ? ((await db
            .select({ id: tierBenefits.id, type: tierBenefits.type, config: tierBenefits.config })
            .from(tierBenefits)
            .where(eq(tierBenefits.tierId, currentTier.id))) as Array<{
            id: string;
            type: "discount" | "reward" | "multiplier" | "free_product";
            config: string | null;
          }>)
        : [];

      const tierState = card.currentTierId
        ? card.tierGraceUntil && card.tierGraceUntil > new Date()
          ? "at_risk"
          : "qualified"
        : "unqualified";

      return {
        data: {
          card: {
            id: card.id,
            campaignId: card.campaignId,
            code: card.code,
            currentTierId: card.currentTierId ?? undefined,
            tierGraceUntil: card.tierGraceUntil ? card.tierGraceUntil.toISOString() : undefined,
            tierLastEvaluatedAt: card.tierLastEvaluatedAt
              ? card.tierLastEvaluatedAt.toISOString()
              : undefined,
            tierState,
            currentTier: currentTier
              ? {
                  id: currentTier.id,
                  name: currentTier.name,
                  order: currentTier.order,
                  thresholdValue: currentTier.thresholdValue,
                  windowUnit: currentTier.windowUnit,
                  windowValue: currentTier.windowValue,
                  minPurchaseCount: currentTier.minPurchaseCount ?? undefined,
                  minPurchaseAmount: currentTier.minPurchaseAmount ?? undefined,
                  qualificationMode: currentTier.qualificationMode,
                  graceDays: currentTier.graceDays,
                  benefits: tierBenefitRows.map((entry) => ({
                    id: entry.id,
                    type: entry.type,
                    config: entry.config ?? undefined,
                  })),
                }
              : undefined,
            status: card.status,
            createdAt: card.createdAt.toISOString(),
          },
          totals: {
            current: totalBalance?.current ?? 0,
            lifetime: totalBalance?.lifetime ?? 0,
          },
          campaigns: campaignRows.map((row) => ({
            campaignId: row.campaignId,
            campaignName: row.campaignName,
            enrollmentMode: row.enrollmentMode,
            subscriptionStatus: row.subscriptionStatus ?? undefined,
            current: row.current ?? 0,
            lifetime: row.lifetime ?? 0,
          })),
          storeBreakdown: [...storeActivityById.values()],
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles] }),
      headers: authorizationHeader,
      response: {
        200: userWalletResponse,
      },
      detail: {
        summary: "Obtener wallet actual del usuario autenticado",
        security: [{ bearerAuth: [] }],
      },
    },
  )
  .get(
    "/me",
    async ({ auth, status }: UserMeContext) => {
      if (!auth || !isUserAuth(auth)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "Token de usuario requerido",
          },
        });
      }

      const [user] = (await db.select().from(users).where(eq(users.id, auth.userId))) as Array<{
        id: string;
        phone: string;
        email: string | null;
        name: string | null;
        role: string;
        status: string;
        tenantId: string | null;
        tenantType: "cpg" | "store" | null;
        blockedUntil: Date | null;
        createdAt: Date;
      }>;
      if (!user) {
        return status(404, {
          error: {
            code: "USER_NOT_FOUND",
            message: "Usuario no encontrado",
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
          createdAt: user.createdAt.toISOString(),
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles] }),
      headers: authorizationHeader,
      response: {
        200: userMeResponse,
      },
      detail: {
        summary: "Obtener perfil del usuario autenticado",
        security: [{ bearerAuth: [] }],
      },
    },
  )
  .patch(
    "/me",
    async ({ auth, body, status }: UserMeUpdateContext) => {
      if (!auth || !isUserAuth(auth)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "Token de usuario requerido",
          },
        });
      }

      if (body.name === undefined && body.email === undefined) {
        return status(400, {
          error: {
            code: "INVALID_ARGUMENT",
            message: "Debes enviar al menos name o email",
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
              code: "USER_EXISTS",
              message: "El email ya está en uso",
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

      const [updated] = (await db
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
          createdAt: users.createdAt,
        })) as Array<{
        id: string;
        phone: string;
        email: string | null;
        name: string | null;
        role: string;
        status: string;
        tenantId: string | null;
        tenantType: "cpg" | "store" | null;
        blockedUntil: Date | null;
        createdAt: Date;
      }>;

      if (!updated) {
        return status(404, {
          error: {
            code: "USER_NOT_FOUND",
            message: "Usuario no encontrado",
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
          createdAt: updated.createdAt.toISOString(),
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles] }),
      headers: authorizationHeader,
      body: userMeUpdateRequest,
      response: {
        200: userMeResponse,
      },
      detail: {
        summary: "Actualizar perfil del usuario autenticado",
        security: [{ bearerAuth: [] }],
      },
    },
  );
