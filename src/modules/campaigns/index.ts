import { and, desc, eq, lt, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { authGuard, authPlugin, type AuthContext } from "../../app/plugins/auth";
import { isUserAuth } from "../../app/plugins/permissions";
import { authorizationHeader } from "../../app/plugins/schemas";
import { parseCursor, parseLimit } from "../../app/utils/pagination";
import { db } from "../../db/client";
import {
  brands,
  campaignAccumulationRules,
  campaignAuditLogs,
  campaignPolicies,
  campaignSubscriptions,
  campaigns,
  campaignTiers,
  campaignStoreEnrollments,
  cpgStoreRelations,
  products,
  stores,
  tierBenefits,
} from "../../db/schema";
import type { StatusHandler } from "../../types/handlers";
import {
  campaignAuditListResponse,
  campaignAuditQuery,
  campaignCreateRequest,
  campaignSubscribeResponse,
  campaignSubscriptionListResponse,
  campaignListQuery,
  campaignListResponse,
  campaignNoteRequest,
  campaignPolicyCreateRequest,
  campaignAccumulationRuleCreateRequest,
  campaignAccumulationRuleListResponse,
  campaignAccumulationRuleResponse,
  campaignAccumulationRuleUpdateRequest,
  campaignPolicyListResponse,
  campaignPolicyResponse,
  campaignPolicyUpdateRequest,
  campaignTierCreateRequest,
  campaignTierListResponse,
  campaignTierResponse,
  campaignTierUpdateRequest,
  campaignResponse,
  campaignReviewRequest,
  campaignUpdateRequest,
  campaignStoreTargetRequest,
  campaignStoreEnrollRequest,
  campaignStoreListResponse,
} from "./model";
import {
  isStoreVisibleForCampaign,
  getStoreEnrollmentForCampaign,
  isStoreParticipatingInCampaign,
} from "../../services/campaign-store-access";
import {
  getRelatedCpgIdsForStore,
  touchStoreCpgRelations,
} from "../../services/store-cpg-relations";

const allowedRoles = ["cpg_admin", "qoa_support", "qoa_admin"] as const;

type CampaignRow = {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  cpgId: string | null;
  status: string;
  enrollmentMode: "open" | "opt_in" | "system_universal";
  storeAccessMode: "all_related_stores" | "selected_stores";
  storeEnrollmentMode: "store_opt_in" | "cpg_managed" | "auto_enroll";
  accumulationMode: "count" | "amount";
  startsAt: Date | null;
  endsAt: Date | null;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date | null;
};

type CampaignAuditRow = {
  id: string;
  campaignId: string;
  action: string;
  notes: string | null;
  actorUserId: string | null;
  metadata: string | null;
  createdAt: Date;
};

type CampaignPolicyRow = {
  id: string;
  campaignId: string;
  policyType: "max_accumulations" | "min_amount" | "min_quantity" | "cooldown";
  scopeType: "campaign" | "brand" | "product";
  scopeId: string | null;
  scopeBrandId: string | null;
  scopeProductId: string | null;
  period: "transaction" | "day" | "week" | "month" | "lifetime";
  value: number;
  config: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date | null;
};

type CampaignAccumulationRuleRow = {
  id: string;
  campaignId: string;
  scopeType: "campaign" | "brand" | "product";
  scopeId: string | null;
  scopeBrandId: string | null;
  scopeProductId: string | null;
  multiplier: number;
  flatBonus: number;
  priority: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date | null;
};

type CampaignTierRow = {
  id: string;
  campaignId: string;
  name: string;
  order: number;
  thresholdValue: number;
  windowUnit: "day" | "month" | "year";
  windowValue: number;
  minPurchaseCount: number | null;
  minPurchaseAmount: number | null;
  qualificationMode: "any" | "all";
  graceDays: number;
  createdAt: Date;
  updatedAt: Date | null;
};

type TierBenefitRow = {
  id: string;
  tierId: string;
  type: "discount" | "reward" | "multiplier" | "free_product";
  config: string | null;
};

type PolicySummary = {
  policyType: CampaignPolicyRow["policyType"];
  scopeType: CampaignPolicyRow["scopeType"];
  period: CampaignPolicyRow["period"];
  value: number;
  label: string;
};

type CampaignListContext = {
  auth: AuthContext | null;
  query: {
    status?: string;
    cpgId?: string;
    enrollmentMode?: "open" | "opt_in" | "system_universal";
    limit?: string;
    cursor?: string;
  };
  status: StatusHandler;
};

type CampaignCreateContext = {
  auth: AuthContext | null;
  body: {
    name: string;
    key?: string;
    description?: string;
    cpgId?: string;
    enrollmentMode?: "open" | "opt_in" | "system_universal";
    accumulationMode?: "count" | "amount";
    startsAt?: string;
    endsAt?: string;
  };
  status: StatusHandler;
};

type CampaignParamsContext = {
  auth: AuthContext | null;
  params: { campaignId: string };
  status: StatusHandler;
};

type CampaignUpdateContext = {
  auth: AuthContext | null;
  params: { campaignId: string };
  body: {
    name?: string;
    description?: string;
    enrollmentMode?: "open" | "opt_in" | "system_universal";
    accumulationMode?: "count" | "amount";
    startsAt?: string;
    endsAt?: string;
    status?: string;
  };
  status: StatusHandler;
};

type CampaignSubscribeContext = {
  auth: AuthContext | null;
  params: { campaignId: string };
  status: StatusHandler;
};

type CampaignSubscriptionsMeContext = {
  auth: AuthContext | null;
  status: StatusHandler;
};

type CampaignReviewContext = {
  auth: AuthContext | null;
  params: { campaignId: string };
  body: {
    approved?: boolean;
    notes?: string;
  };
  status: StatusHandler;
};

type CampaignNoteContext = {
  auth: AuthContext | null;
  params: { campaignId: string };
  body: {
    notes?: string;
    reason?: string;
  };
  status: StatusHandler;
};

type CampaignAuditContext = {
  auth: AuthContext | null;
  params: { campaignId: string };
  query: {
    limit?: string;
    cursor?: string;
  };
  status: StatusHandler;
};

type CampaignPolicyListContext = {
  auth: AuthContext | null;
  params: { campaignId: string };
  status: StatusHandler;
};

type CampaignPolicyCreateContext = {
  auth: AuthContext | null;
  params: { campaignId: string };
  body: {
    policyType: CampaignPolicyRow["policyType"];
    scopeType: CampaignPolicyRow["scopeType"];
    scopeId?: string;
    period: CampaignPolicyRow["period"];
    value: number;
    config?: string;
    active?: boolean;
  };
  status: StatusHandler;
};

type CampaignPolicyUpdateContext = {
  auth: AuthContext | null;
  params: { campaignId: string; policyId: string };
  body: {
    policyType?: CampaignPolicyRow["policyType"];
    scopeType?: CampaignPolicyRow["scopeType"];
    scopeId?: string;
    period?: CampaignPolicyRow["period"];
    value?: number;
    config?: string;
    active?: boolean;
  };
  status: StatusHandler;
};

type CampaignAccumulationRuleListContext = {
  auth: AuthContext | null;
  params: { campaignId: string };
  status: StatusHandler;
};

type CampaignAccumulationRuleCreateContext = {
  auth: AuthContext | null;
  params: { campaignId: string };
  body: {
    scopeType: CampaignAccumulationRuleRow["scopeType"];
    scopeId?: string;
    multiplier?: number;
    flatBonus?: number;
    priority?: number;
    active?: boolean;
  };
  status: StatusHandler;
};

type CampaignAccumulationRuleUpdateContext = {
  auth: AuthContext | null;
  params: { campaignId: string; ruleId: string };
  body: {
    scopeType?: CampaignAccumulationRuleRow["scopeType"];
    scopeId?: string;
    multiplier?: number;
    flatBonus?: number;
    priority?: number;
    active?: boolean;
  };
  status: StatusHandler;
};

type CampaignAccumulationRuleDeleteContext = {
  auth: AuthContext | null;
  params: { campaignId: string; ruleId: string };
  status: StatusHandler;
};

type CampaignTierListContext = {
  auth: AuthContext | null;
  params: { campaignId: string };
  status: StatusHandler;
};

type CampaignTierCreateContext = {
  auth: AuthContext | null;
  params: { campaignId: string };
  body: {
    name: string;
    order: number;
    thresholdValue: number;
    windowUnit?: "day" | "month" | "year";
    windowValue?: number;
    minPurchaseCount?: number;
    minPurchaseAmount?: number;
    qualificationMode?: "any" | "all";
    graceDays?: number;
    benefits?: Array<{
      type: TierBenefitRow["type"];
      config?: string;
    }>;
  };
  status: StatusHandler;
};

type CampaignTierUpdateContext = {
  auth: AuthContext | null;
  params: { campaignId: string; tierId: string };
  body: {
    name?: string;
    order?: number;
    thresholdValue?: number;
    windowUnit?: "day" | "month" | "year";
    windowValue?: number;
    minPurchaseCount?: number;
    minPurchaseAmount?: number;
    qualificationMode?: "any" | "all";
    graceDays?: number;
    benefits?: Array<{
      type: TierBenefitRow["type"];
      config?: string;
    }>;
  };
  status: StatusHandler;
};

type CampaignTierDeleteContext = {
  auth: AuthContext | null;
  params: { campaignId: string; tierId: string };
  status: StatusHandler;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const buildPolicyLabel = (
  entry: Pick<CampaignPolicyRow, "policyType" | "scopeType" | "period" | "value">,
) => {
  if (entry.policyType === "min_amount") {
    return `Compra mínima de $${entry.value.toLocaleString("es-MX")} por ${entry.period}`;
  }

  if (entry.policyType === "min_quantity") {
    return `Compra mínima de ${entry.value} pieza(s) por ${entry.period}`;
  }

  if (entry.policyType === "max_accumulations") {
    return `Máximo ${entry.value} acumulaciones por ${entry.period}`;
  }

  return `Enfriamiento de ${entry.value} unidad(es) de tiempo por ${entry.period}`;
};

const deriveCampaignTiming = (campaign: CampaignRow) => {
  if (!campaign.endsAt) {
    return {
      daysRemaining: undefined,
      isExpired: false,
    };
  }

  const diffMs = campaign.endsAt.getTime() - Date.now();
  const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return {
    daysRemaining,
    isExpired: daysRemaining < 0,
  };
};

const serializeCampaign = (
  campaign: CampaignRow,
  policySummaries: PolicySummary[] = [],
  tiers: Array<Record<string, unknown>> = [],
) => {
  const timing = deriveCampaignTiming(campaign);
  return {
    id: campaign.id,
    key: campaign.key ?? undefined,
    name: campaign.name,
    description: campaign.description ?? undefined,
    cpgId: campaign.cpgId ?? undefined,
    status: campaign.status,
    enrollmentMode: campaign.enrollmentMode,
    storeAccessMode: campaign.storeAccessMode,
    storeEnrollmentMode: campaign.storeEnrollmentMode,
    accumulationMode: campaign.accumulationMode,
    startsAt: campaign.startsAt ? campaign.startsAt.toISOString() : undefined,
    endsAt: campaign.endsAt ? campaign.endsAt.toISOString() : undefined,
    version: campaign.version,
    createdBy: campaign.createdBy ?? undefined,
    updatedBy: campaign.updatedBy ?? undefined,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt ? campaign.updatedAt.toISOString() : undefined,
    daysRemaining: timing.daysRemaining,
    isExpired: timing.isExpired,
    policySummaries,
    tiers,
  };
};

const serializeAuditLog = (entry: CampaignAuditRow) => ({
  id: entry.id,
  campaignId: entry.campaignId,
  action: entry.action,
  notes: entry.notes ?? undefined,
  actorUserId: entry.actorUserId ?? undefined,
  metadata: entry.metadata ?? undefined,
  createdAt: entry.createdAt.toISOString(),
});

const serializePolicy = (entry: CampaignPolicyRow) => ({
  id: entry.id,
  campaignId: entry.campaignId,
  policyType: entry.policyType,
  scopeType: entry.scopeType,
  scopeId: entry.scopeId ?? undefined,
  period: entry.period,
  value: entry.value,
  config: entry.config ?? undefined,
  active: entry.active,
  createdAt: entry.createdAt.toISOString(),
  updatedAt: entry.updatedAt ? entry.updatedAt.toISOString() : undefined,
});

const serializeTier = (entry: CampaignTierRow, benefits: TierBenefitRow[] = []) => ({
  id: entry.id,
  campaignId: entry.campaignId,
  name: entry.name,
  order: entry.order,
  thresholdValue: entry.thresholdValue,
  windowUnit: entry.windowUnit,
  windowValue: entry.windowValue,
  minPurchaseCount: entry.minPurchaseCount ?? undefined,
  minPurchaseAmount: entry.minPurchaseAmount ?? undefined,
  qualificationMode: entry.qualificationMode,
  graceDays: entry.graceDays,
  createdAt: entry.createdAt.toISOString(),
  updatedAt: entry.updatedAt ? entry.updatedAt.toISOString() : undefined,
  benefits: benefits.map((benefit) => ({
    id: benefit.id,
    type: benefit.type,
    config: benefit.config ?? undefined,
  })),
});

const serializeAccumulationRule = (entry: CampaignAccumulationRuleRow) => ({
  id: entry.id,
  campaignId: entry.campaignId,
  scopeType: entry.scopeType,
  scopeId: entry.scopeId ?? undefined,
  multiplier: entry.multiplier,
  flatBonus: entry.flatBonus,
  priority: entry.priority,
  active: entry.active,
  createdAt: entry.createdAt.toISOString(),
  updatedAt: entry.updatedAt ? entry.updatedAt.toISOString() : undefined,
});

const loadTierBenefitsByTierId = async (campaignId: string) => {
  const tiers = (await db
    .select({ id: campaignTiers.id })
    .from(campaignTiers)
    .where(eq(campaignTiers.campaignId, campaignId))) as Array<{ id: string }>;

  if (tiers.length === 0) {
    return new Map<string, TierBenefitRow[]>();
  }

  const tierIds = tiers.map((entry) => entry.id);
  const inCondition = and(...tierIds.map((id) => eq(tierBenefits.tierId, id)));
  const benefitRows = (await db.select().from(tierBenefits).where(inCondition)) as TierBenefitRow[];

  const byTier = new Map<string, TierBenefitRow[]>();
  for (const benefit of benefitRows) {
    const current = byTier.get(benefit.tierId) ?? [];
    current.push(benefit);
    byTier.set(benefit.tierId, current);
  }

  return byTier;
};

const resolveActorUserId = (auth: AuthContext | null) => {
  if (!auth || !isUserAuth(auth)) {
    return null;
  }

  return isUuid(auth.userId) ? auth.userId : null;
};

const canAccessCampaign = (auth: AuthContext, campaign: CampaignRow) => {
  if (auth.type === "jwt" || auth.type === "dev") {
    if (auth.role === "qoa_admin" || auth.role === "qoa_support") {
      return true;
    }

    if (auth.role === "cpg_admin") {
      return Boolean(
        auth.tenantType === "cpg" && auth.tenantId && campaign.cpgId === auth.tenantId,
      );
    }

    return false;
  }

  if (auth.type === "api_key" || auth.type === "dev_api_key") {
    return auth.tenantType === "cpg" && campaign.cpgId === auth.tenantId;
  }

  return false;
};

const canCreateForCpg = (auth: AuthContext, cpgId: string | null) => {
  if (auth.type === "jwt" || auth.type === "dev") {
    if (auth.role === "qoa_admin" || auth.role === "qoa_support") {
      return true;
    }

    if (auth.role === "cpg_admin") {
      return Boolean(auth.tenantType === "cpg" && auth.tenantId && cpgId === auth.tenantId);
    }

    return false;
  }

  if (auth.type === "api_key" || auth.type === "dev_api_key") {
    return auth.tenantType === "cpg" && cpgId === auth.tenantId;
  }

  return false;
};

const ensureCampaign = async (campaignId: string) => {
  const [campaign] = (await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))) as CampaignRow[];
  return campaign ?? null;
};

const ensureScope = async (
  campaign: CampaignRow,
  scopeType: CampaignPolicyRow["scopeType"],
  scopeId: string | null,
  status: StatusHandler,
) => {
  if (scopeType === "campaign") {
    if (scopeId) {
      return status(400, {
        error: {
          code: "INVALID_ARGUMENT",
          message: "scopeId debe omitirse cuando scopeType es campaign",
        },
      });
    }
    return null;
  }

  if (!scopeId) {
    return status(400, {
      error: {
        code: "INVALID_ARGUMENT",
        message: "scopeId es obligatorio para scopeType brand/product",
      },
    });
  }

  if (!isUuid(scopeId)) {
    return status(400, {
      error: {
        code: "INVALID_ARGUMENT",
        message: "scopeId debe ser UUID válido",
      },
    });
  }

  if (scopeType === "brand") {
    const [brand] = (await db
      .select({ id: brands.id, cpgId: brands.cpgId })
      .from(brands)
      .where(eq(brands.id, scopeId))) as Array<{ id: string; cpgId: string }>;

    if (!brand) {
      return status(404, {
        error: {
          code: "BRAND_NOT_FOUND",
          message: "Brand no encontrada",
        },
      });
    }

    if (campaign.cpgId && campaign.cpgId !== brand.cpgId) {
      return status(400, {
        error: {
          code: "INVALID_ARGUMENT",
          message: "La brand no pertenece al CPG de la campaña",
        },
      });
    }

    return null;
  }

  const [product] = (await db
    .select({ id: products.id, brandId: products.brandId })
    .from(products)
    .where(eq(products.id, scopeId))) as Array<{ id: string; brandId: string }>;

  if (!product) {
    return status(404, {
      error: {
        code: "PRODUCT_NOT_FOUND",
        message: "Producto no encontrado",
      },
    });
  }

  if (campaign.cpgId) {
    const [brand] = (await db
      .select({ cpgId: brands.cpgId })
      .from(brands)
      .where(eq(brands.id, product.brandId))) as Array<{ cpgId: string }>;

    if (!brand || brand.cpgId !== campaign.cpgId) {
      return status(400, {
        error: {
          code: "INVALID_ARGUMENT",
          message: "El producto no pertenece al CPG de la campaña",
        },
      });
    }
  }

  return null;
};

const parsePolicyConfig = (config: string | undefined) =>
  config === undefined || config === "" ? null : config;

const appendAudit = async (
  campaignId: string,
  action: string,
  notes: string | null,
  auth: AuthContext | null,
  metadata?: Record<string, unknown>,
) => {
  await db.insert(campaignAuditLogs).values({
    campaignId,
    action,
    notes,
    actorUserId: resolveActorUserId(auth),
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
};

const invalidTransition = (status: StatusHandler, fromStatus: string, toStatus: string) =>
  status(409, {
    error: {
      code: "INVALID_STATUS_TRANSITION",
      message: `No se puede mover de ${fromStatus} a ${toStatus}`,
    },
  });

export const campaignsModule = new Elysia({
  prefix: "/campaigns",
  detail: {
    tags: ["Campaigns"],
  },
})
  .use(authPlugin)
  .get(
    "/discover",
    async ({ auth, status }: CampaignSubscriptionsMeContext) => {
      if (!auth || !isUserAuth(auth)) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const rows = (await db
        .select({
          id: campaigns.id,
          key: campaigns.key,
          name: campaigns.name,
          description: campaigns.description,
          cpgId: campaigns.cpgId,
          status: campaigns.status,
          enrollmentMode: campaigns.enrollmentMode,
          accumulationMode: campaigns.accumulationMode,
          startsAt: campaigns.startsAt,
          endsAt: campaigns.endsAt,
          version: campaigns.version,
          createdBy: campaigns.createdBy,
          updatedBy: campaigns.updatedBy,
          createdAt: campaigns.createdAt,
          updatedAt: campaigns.updatedAt,
        })
        .from(campaigns)
        .where(and(eq(campaigns.status, "active")))
        .orderBy(desc(campaigns.createdAt))) as CampaignRow[];

      const filtered = rows.filter((row) => row.enrollmentMode !== "system_universal");

      const policyEntries = await Promise.all(
        filtered.map(async (campaign) => {
          const rows = (await db
            .select()
            .from(campaignPolicies)
            .where(
              and(eq(campaignPolicies.campaignId, campaign.id), eq(campaignPolicies.active, true)),
            )
            .orderBy(desc(campaignPolicies.createdAt))) as CampaignPolicyRow[];

          return [
            campaign.id,
            rows.slice(0, 4).map((entry) => ({
              policyType: entry.policyType,
              scopeType: entry.scopeType,
              period: entry.period,
              value: entry.value,
              label: buildPolicyLabel(entry),
            })),
          ] as const;
        }),
      );
      const policyMap = new Map<string, PolicySummary[]>(policyEntries);

      return {
        data: filtered.map((campaign) =>
          serializeCampaign(campaign, policyMap.get(campaign.id) ?? []),
        ),
        pagination: {
          hasMore: false,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: ["consumer", "customer"] }),
      headers: authorizationHeader,
      response: {
        200: campaignListResponse,
      },
      detail: {
        summary: "Descubrir campañas para wallet",
      },
    },
  )
  .get(
    "/subscriptions/me",
    async ({ auth, status }: CampaignSubscriptionsMeContext) => {
      if (!auth || !isUserAuth(auth)) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const rows = (await db.execute(sql`
        select
          cs.campaign_id as "campaignId",
          c.name as "campaignName",
          c.enrollment_mode as "enrollmentMode",
          c.starts_at as "startsAt",
          c.ends_at as "endsAt",
          cs.status,
          cs.subscribed_at as "subscribedAt"
        from campaign_subscriptions cs
        inner join campaigns c on c.id = cs.campaign_id
        where cs.user_id = ${auth.userId}
        order by cs.created_at desc
      `)) as Array<{
        campaignId: string;
        campaignName: string;
        enrollmentMode: "open" | "opt_in" | "system_universal";
        startsAt: Date | null;
        endsAt: Date | null;
        status: string;
        subscribedAt: Date | null;
      }>;

      const policyEntries = await Promise.all(
        rows.map(async (entry) => {
          const items = (await db
            .select()
            .from(campaignPolicies)
            .where(
              and(
                eq(campaignPolicies.campaignId, entry.campaignId),
                eq(campaignPolicies.active, true),
              ),
            )
            .orderBy(desc(campaignPolicies.createdAt))) as CampaignPolicyRow[];

          return [
            entry.campaignId,
            items.slice(0, 4).map((policy) => ({
              policyType: policy.policyType,
              scopeType: policy.scopeType,
              period: policy.period,
              value: policy.value,
              label: buildPolicyLabel(policy),
            })),
          ] as const;
        }),
      );
      const policyMap = new Map<string, PolicySummary[]>(policyEntries);

      return {
        data: rows.map((row) => ({
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          enrollmentMode: row.enrollmentMode,
          startsAt:
            row.startsAt instanceof Date
              ? row.startsAt.toISOString()
              : typeof row.startsAt === "string"
                ? new Date(row.startsAt).toISOString()
                : undefined,
          endsAt:
            row.endsAt instanceof Date
              ? row.endsAt.toISOString()
              : typeof row.endsAt === "string"
                ? new Date(row.endsAt).toISOString()
                : undefined,
          daysRemaining:
            row.endsAt instanceof Date
              ? Math.ceil((row.endsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
              : typeof row.endsAt === "string"
                ? Math.ceil((new Date(row.endsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
                : undefined,
          status: row.status,
          subscribedAt:
            row.subscribedAt instanceof Date
              ? row.subscribedAt.toISOString()
              : typeof row.subscribedAt === "string"
                ? new Date(row.subscribedAt).toISOString()
                : undefined,
          policySummaries: policyMap.get(row.campaignId) ?? [],
        })),
      };
    },
    {
      beforeHandle: authGuard({ roles: ["consumer", "customer"] }),
      headers: authorizationHeader,
      response: {
        200: campaignSubscriptionListResponse,
      },
      detail: {
        summary: "Listar suscripciones de campañas del usuario",
      },
    },
  )
  .post(
    "/:campaignId/subscribe",
    async ({ auth, params, status }: CampaignSubscribeContext) => {
      if (!auth || !isUserAuth(auth)) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const [campaign] = (await db
        .select({
          id: campaigns.id,
          status: campaigns.status,
          enrollmentMode: campaigns.enrollmentMode,
        })
        .from(campaigns)
        .where(eq(campaigns.id, params.campaignId))) as Array<{
        id: string;
        status: string;
        enrollmentMode: "open" | "opt_in" | "system_universal";
      }>;

      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (campaign.status !== "active") {
        return status(422, {
          error: {
            code: "CAMPAIGN_NOT_ACTIVE",
            message: "Solo se permiten suscripciones a campañas activas",
          },
        });
      }

      const now = new Date();
      const [existing] = (await db
        .select({ id: campaignSubscriptions.id })
        .from(campaignSubscriptions)
        .where(
          and(
            eq(campaignSubscriptions.userId, auth.userId),
            eq(campaignSubscriptions.campaignId, campaign.id),
          ),
        )) as Array<{
        id: string;
      }>;

      if (existing) {
        await db
          .update(campaignSubscriptions)
          .set({
            status: "subscribed",
            subscribedAt: now,
            leftAt: null,
            updatedAt: now,
          })
          .where(eq(campaignSubscriptions.id, existing.id));
      } else {
        await db.insert(campaignSubscriptions).values({
          userId: auth.userId,
          campaignId: campaign.id,
          status: "subscribed",
          invitedAt: campaign.enrollmentMode === "opt_in" ? now : null,
          subscribedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      return {
        data: {
          campaignId: campaign.id,
          status: "subscribed",
          subscribedAt: now.toISOString(),
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: ["consumer", "customer"] }),
      headers: authorizationHeader,
      response: {
        200: campaignSubscribeResponse,
      },
      detail: {
        summary: "Suscribirse a campaña",
      },
    },
  )
  .get(
    "/",
    async ({ auth, query, status }: CampaignListContext) => {
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

      const conditions = [];
      if (query.status) {
        conditions.push(eq(campaigns.status, query.status));
      }

      if (query.enrollmentMode) {
        conditions.push(eq(campaigns.enrollmentMode, query.enrollmentMode));
      }

      if (query.cpgId) {
        conditions.push(eq(campaigns.cpgId, query.cpgId));
      }

      if (cursorDate) {
        conditions.push(lt(campaigns.createdAt, cursorDate));
      }

      if (auth.type === "jwt" || auth.type === "dev") {
        if (auth.role === "cpg_admin") {
          if (!auth.tenantId || auth.tenantType !== "cpg") {
            return status(403, {
              error: {
                code: "FORBIDDEN",
                message: "Tenant inválido para cpg_admin",
              },
            });
          }
          conditions.push(eq(campaigns.cpgId, auth.tenantId));
        }
      } else if (auth.type === "api_key" || auth.type === "dev_api_key") {
        if (auth.tenantType !== "cpg") {
          return status(403, {
            error: {
              code: "FORBIDDEN",
              message: "Solo API keys de CPG pueden listar campañas",
            },
          });
        }
        conditions.push(eq(campaigns.cpgId, auth.tenantId));
      }

      const limit = parseLimit(query.limit);
      let queryBuilder = db.select().from(campaigns);
      if (conditions.length > 0) {
        queryBuilder = queryBuilder.where(and(...conditions));
      }

      const rows = (await queryBuilder
        .orderBy(desc(campaigns.createdAt), desc(campaigns.id))
        .limit(limit + 1)) as CampaignRow[];
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : null;

      return {
        data: items.map((item) => serializeCampaign(item)),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      query: campaignListQuery,
      response: {
        200: campaignListResponse,
      },
      detail: {
        summary: "Listar campañas",
      },
    },
  )
  .post(
    "/",
    async ({ auth, body, status }: CampaignCreateContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const startsAt = body.startsAt ? new Date(body.startsAt) : null;
      const endsAt = body.endsAt ? new Date(body.endsAt) : null;

      if (
        (startsAt && Number.isNaN(startsAt.getTime())) ||
        (endsAt && Number.isNaN(endsAt.getTime()))
      ) {
        return status(400, {
          error: {
            code: "INVALID_ARGUMENT",
            message: "Fechas inválidas",
          },
        });
      }

      if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
        return status(400, {
          error: {
            code: "INVALID_ARGUMENT",
            message: "startsAt debe ser menor que endsAt",
          },
        });
      }

      const cpgId = body.cpgId ?? null;
      if (!canCreateForCpg(auth, cpgId)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No puedes crear campañas para este CPG",
          },
        });
      }

      const [created] = (await db
        .insert(campaigns)
        .values({
          key: body.key ?? null,
          name: body.name,
          description: body.description ?? null,
          cpgId,
          enrollmentMode: body.enrollmentMode ?? "opt_in",
          accumulationMode: body.accumulationMode ?? "count",
          startsAt,
          endsAt,
          createdBy: resolveActorUserId(auth),
          updatedBy: resolveActorUserId(auth),
        })
        .returning()) as CampaignRow[];

      if (!created) {
        return status(500, {
          error: {
            code: "CAMPAIGN_CREATE_FAILED",
            message: "No se pudo crear la campaña",
          },
        });
      }

      await appendAudit(created.id, "campaign.created", null, auth, {
        status: created.status,
      });

      return status(201, {
        data: serializeCampaign(created),
      });
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      body: campaignCreateRequest,
      response: {
        201: campaignResponse,
      },
      detail: {
        summary: "Crear campaña",
      },
    },
  )
  .get(
    "/:campaignId",
    async ({ auth, params, status }: CampaignParamsContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      const tierRows = (await db
        .select()
        .from(campaignTiers)
        .where(eq(campaignTiers.campaignId, campaign.id))
        .orderBy(campaignTiers.order, campaignTiers.thresholdValue)) as CampaignTierRow[];
      const benefitMap = await loadTierBenefitsByTierId(campaign.id);

      return {
        data: serializeCampaign(
          campaign,
          [],
          tierRows.map((entry) => serializeTier(entry, benefitMap.get(entry.id) ?? [])),
        ),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      response: {
        200: campaignResponse,
      },
      detail: {
        summary: "Obtener campaña",
      },
    },
  )
  .patch(
    "/:campaignId",
    async ({ auth, params, body, status }: CampaignUpdateContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      if (campaign.status !== "draft" && campaign.status !== "rejected") {
        return status(409, {
          error: {
            code: "CAMPAIGN_LOCKED",
            message: "Solo campañas en draft o rejected pueden editarse",
          },
        });
      }

      const startsAt = body.startsAt ? new Date(body.startsAt) : campaign.startsAt;
      const endsAt = body.endsAt ? new Date(body.endsAt) : campaign.endsAt;
      if (
        (startsAt && Number.isNaN(startsAt.getTime())) ||
        (endsAt && Number.isNaN(endsAt.getTime()))
      ) {
        return status(400, {
          error: {
            code: "INVALID_ARGUMENT",
            message: "Fechas inválidas",
          },
        });
      }

      if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
        return status(400, {
          error: {
            code: "INVALID_ARGUMENT",
            message: "startsAt debe ser menor que endsAt",
          },
        });
      }

      const [updated] = (await db
        .update(campaigns)
        .set({
          name: body.name ?? campaign.name,
          description: body.description ?? campaign.description,
          enrollmentMode: body.enrollmentMode ?? campaign.enrollmentMode,
          accumulationMode: body.accumulationMode ?? campaign.accumulationMode,
          startsAt,
          endsAt,
          status: body.status ?? campaign.status,
          version: campaign.version + 1,
          updatedBy: resolveActorUserId(auth),
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaign.id))
        .returning()) as CampaignRow[];

      if (!updated) {
        return status(500, {
          error: {
            code: "CAMPAIGN_UPDATE_FAILED",
            message: "No se pudo actualizar la campaña",
          },
        });
      }

      await appendAudit(updated.id, "campaign.updated", null, auth, {
        status: updated.status,
      });

      return {
        data: serializeCampaign(updated),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      body: campaignUpdateRequest,
      response: {
        200: campaignResponse,
      },
      detail: {
        summary: "Actualizar campaña",
      },
    },
  )
  .get(
    "/:campaignId/policies",
    async ({ auth, params, status }: CampaignPolicyListContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      const rows = (await db
        .select()
        .from(campaignPolicies)
        .where(eq(campaignPolicies.campaignId, campaign.id))
        .orderBy(desc(campaignPolicies.createdAt))) as CampaignPolicyRow[];

      return {
        data: rows.map(serializePolicy),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      response: {
        200: campaignPolicyListResponse,
      },
      detail: {
        summary: "Listar políticas de campaña",
      },
    },
  )
  .post(
    "/:campaignId/policies",
    async ({ auth, params, body, status }: CampaignPolicyCreateContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      if (campaign.status !== "draft" && campaign.status !== "rejected") {
        return status(409, {
          error: {
            code: "CAMPAIGN_LOCKED",
            message: "Solo campañas en draft o rejected permiten editar políticas",
          },
        });
      }

      const scopeId = body.scopeId ?? null;
      const scopeError = await ensureScope(campaign, body.scopeType, scopeId, status);
      if (scopeError) {
        return scopeError;
      }

      const parsedConfig = parsePolicyConfig(body.config);

      const [created] = (await db
        .insert(campaignPolicies)
        .values({
          campaignId: campaign.id,
          policyType: body.policyType,
          scopeType: body.scopeType,
          scopeId,
          scopeBrandId: body.scopeType === "brand" ? scopeId : null,
          scopeProductId: body.scopeType === "product" ? scopeId : null,
          period: body.period,
          value: body.value,
          config: parsedConfig,
          active: body.active ?? true,
          updatedAt: new Date(),
        })
        .returning()) as CampaignPolicyRow[];

      if (!created) {
        return status(500, {
          error: {
            code: "CAMPAIGN_POLICY_CREATE_FAILED",
            message: "No se pudo crear la política de campaña",
          },
        });
      }

      await appendAudit(created.campaignId, "campaign.policy_created", null, auth, {
        policyId: created.id,
        policyType: created.policyType,
        scopeType: created.scopeType,
      });

      return status(201, {
        data: serializePolicy(created),
      });
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      body: campaignPolicyCreateRequest,
      response: {
        201: campaignPolicyResponse,
      },
      detail: {
        summary: "Crear política de campaña",
      },
    },
  )
  .patch(
    "/:campaignId/policies/:policyId",
    async ({ auth, params, body, status }: CampaignPolicyUpdateContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      if (campaign.status !== "draft" && campaign.status !== "rejected") {
        return status(409, {
          error: {
            code: "CAMPAIGN_LOCKED",
            message: "Solo campañas en draft o rejected permiten editar políticas",
          },
        });
      }

      const [existing] = (await db
        .select()
        .from(campaignPolicies)
        .where(
          and(
            eq(campaignPolicies.id, params.policyId),
            eq(campaignPolicies.campaignId, campaign.id),
          ),
        )) as CampaignPolicyRow[] | [];

      if (!existing) {
        return status(404, {
          error: {
            code: "CAMPAIGN_POLICY_NOT_FOUND",
            message: "Política no encontrada",
          },
        });
      }

      const nextScopeType = body.scopeType ?? existing.scopeType;
      const nextScopeId =
        body.scopeType === "campaign"
          ? null
          : body.scopeId !== undefined
            ? body.scopeId
            : existing.scopeType === "campaign"
              ? null
              : existing.scopeId;

      const scopeError = await ensureScope(campaign, nextScopeType, nextScopeId ?? null, status);
      if (scopeError) {
        return scopeError;
      }

      const parsedConfig = parsePolicyConfig(body.config);

      const [updated] = (await db
        .update(campaignPolicies)
        .set({
          policyType: body.policyType ?? existing.policyType,
          scopeType: nextScopeType,
          scopeId: nextScopeId ?? null,
          scopeBrandId: nextScopeType === "brand" ? (nextScopeId ?? null) : null,
          scopeProductId: nextScopeType === "product" ? (nextScopeId ?? null) : null,
          period: body.period ?? existing.period,
          value: body.value ?? existing.value,
          config: body.config !== undefined ? parsedConfig : existing.config,
          active: body.active ?? existing.active,
          updatedAt: new Date(),
        })
        .where(eq(campaignPolicies.id, existing.id))
        .returning()) as CampaignPolicyRow[];

      if (!updated) {
        return status(500, {
          error: {
            code: "CAMPAIGN_POLICY_UPDATE_FAILED",
            message: "No se pudo actualizar la política de campaña",
          },
        });
      }

      await appendAudit(updated.campaignId, "campaign.policy_updated", null, auth, {
        policyId: updated.id,
        policyType: updated.policyType,
        scopeType: updated.scopeType,
      });

      return {
        data: serializePolicy(updated),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      body: campaignPolicyUpdateRequest,
      response: {
        200: campaignPolicyResponse,
      },
      detail: {
        summary: "Actualizar política de campaña",
      },
    },
  )
  .get(
    "/:campaignId/accumulation-rules",
    async ({ auth, params, status }: CampaignAccumulationRuleListContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      const rows = (await db
        .select()
        .from(campaignAccumulationRules)
        .where(eq(campaignAccumulationRules.campaignId, campaign.id))
        .orderBy(
          campaignAccumulationRules.priority,
          desc(campaignAccumulationRules.createdAt),
        )) as CampaignAccumulationRuleRow[];

      return {
        data: rows.map(serializeAccumulationRule),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      response: {
        200: campaignAccumulationRuleListResponse,
      },
      detail: {
        summary: "Listar reglas de acumulación",
      },
    },
  )
  .post(
    "/:campaignId/accumulation-rules",
    async ({ auth, params, body, status }: CampaignAccumulationRuleCreateContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      if (campaign.status !== "draft" && campaign.status !== "rejected") {
        return status(409, {
          error: {
            code: "CAMPAIGN_LOCKED",
            message: "Solo campañas en draft o rejected permiten editar reglas de acumulación",
          },
        });
      }

      const scopeId = body.scopeId ?? null;
      const scopeError = await ensureScope(campaign, body.scopeType, scopeId, status);
      if (scopeError) {
        return scopeError;
      }

      const [created] = (await db
        .insert(campaignAccumulationRules)
        .values({
          campaignId: campaign.id,
          scopeType: body.scopeType,
          scopeId,
          scopeBrandId: body.scopeType === "brand" ? scopeId : null,
          scopeProductId: body.scopeType === "product" ? scopeId : null,
          multiplier: body.multiplier ?? 1,
          flatBonus: body.flatBonus ?? 0,
          priority: body.priority ?? 100,
          active: body.active ?? true,
          updatedAt: new Date(),
        })
        .returning()) as CampaignAccumulationRuleRow[];

      if (!created) {
        return status(500, {
          error: {
            code: "CAMPAIGN_ACCUMULATION_RULE_CREATE_FAILED",
            message: "No se pudo crear la regla de acumulación",
          },
        });
      }

      await appendAudit(created.campaignId, "campaign.accumulation_rule_created", null, auth, {
        ruleId: created.id,
        scopeType: created.scopeType,
      });

      return status(201, {
        data: serializeAccumulationRule(created),
      });
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      body: campaignAccumulationRuleCreateRequest,
      response: {
        201: campaignAccumulationRuleResponse,
      },
      detail: {
        summary: "Crear regla de acumulación",
      },
    },
  )
  .patch(
    "/:campaignId/accumulation-rules/:ruleId",
    async ({ auth, params, body, status }: CampaignAccumulationRuleUpdateContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      if (campaign.status !== "draft" && campaign.status !== "rejected") {
        return status(409, {
          error: {
            code: "CAMPAIGN_LOCKED",
            message: "Solo campañas en draft o rejected permiten editar reglas de acumulación",
          },
        });
      }

      const [existing] = (await db
        .select()
        .from(campaignAccumulationRules)
        .where(
          and(
            eq(campaignAccumulationRules.id, params.ruleId),
            eq(campaignAccumulationRules.campaignId, campaign.id),
          ),
        )) as CampaignAccumulationRuleRow[];

      if (!existing) {
        return status(404, {
          error: {
            code: "CAMPAIGN_ACCUMULATION_RULE_NOT_FOUND",
            message: "Regla de acumulación no encontrada",
          },
        });
      }

      const nextScopeType = body.scopeType ?? existing.scopeType;
      const nextScopeId =
        body.scopeType === "campaign"
          ? null
          : body.scopeId !== undefined
            ? body.scopeId
            : existing.scopeType === "campaign"
              ? null
              : existing.scopeId;
      const scopeError = await ensureScope(campaign, nextScopeType, nextScopeId ?? null, status);
      if (scopeError) {
        return scopeError;
      }

      const [updated] = (await db
        .update(campaignAccumulationRules)
        .set({
          scopeType: nextScopeType,
          scopeId: nextScopeId ?? null,
          scopeBrandId: nextScopeType === "brand" ? (nextScopeId ?? null) : null,
          scopeProductId: nextScopeType === "product" ? (nextScopeId ?? null) : null,
          multiplier: body.multiplier ?? existing.multiplier,
          flatBonus: body.flatBonus ?? existing.flatBonus,
          priority: body.priority ?? existing.priority,
          active: body.active ?? existing.active,
          updatedAt: new Date(),
        })
        .where(eq(campaignAccumulationRules.id, existing.id))
        .returning()) as CampaignAccumulationRuleRow[];

      if (!updated) {
        return status(500, {
          error: {
            code: "CAMPAIGN_ACCUMULATION_RULE_UPDATE_FAILED",
            message: "No se pudo actualizar la regla de acumulación",
          },
        });
      }

      await appendAudit(updated.campaignId, "campaign.accumulation_rule_updated", null, auth, {
        ruleId: updated.id,
        scopeType: updated.scopeType,
      });

      return {
        data: serializeAccumulationRule(updated),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      body: campaignAccumulationRuleUpdateRequest,
      response: {
        200: campaignAccumulationRuleResponse,
      },
      detail: {
        summary: "Actualizar regla de acumulación",
      },
    },
  )
  // @ts-ignore: TypeScript loses inference after long chain
  .delete(
    "/:campaignId/accumulation-rules/:ruleId",
    async ({ auth, params, status }: CampaignAccumulationRuleDeleteContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      if (campaign.status !== "draft" && campaign.status !== "rejected") {
        return status(409, {
          error: {
            code: "CAMPAIGN_LOCKED",
            message: "Solo campañas en draft o rejected permiten editar reglas de acumulación",
          },
        });
      }

      const [existing] = (await db
        .select({
          id: campaignAccumulationRules.id,
          campaignId: campaignAccumulationRules.campaignId,
        })
        .from(campaignAccumulationRules)
        .where(
          and(
            eq(campaignAccumulationRules.id, params.ruleId),
            eq(campaignAccumulationRules.campaignId, campaign.id),
          ),
        )) as Array<{ id: string; campaignId: string }>;

      if (!existing) {
        return status(404, {
          error: {
            code: "CAMPAIGN_ACCUMULATION_RULE_NOT_FOUND",
            message: "Regla de acumulación no encontrada",
          },
        });
      }

      await db
        .delete(campaignAccumulationRules)
        .where(eq(campaignAccumulationRules.id, existing.id));
      await appendAudit(existing.campaignId, "campaign.accumulation_rule_deleted", null, auth, {
        ruleId: existing.id,
      });

      return new Response(null, { status: 204 });
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      detail: {
        summary: "Eliminar regla de acumulación",
      },
    },
  )
  .get(
    "/:campaignId/tiers",
    async ({ auth, params, status }: CampaignTierListContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      const tierRows = (await db
        .select()
        .from(campaignTiers)
        .where(eq(campaignTiers.campaignId, campaign.id))
        .orderBy(campaignTiers.order, campaignTiers.thresholdValue)) as CampaignTierRow[];

      const benefitMap = await loadTierBenefitsByTierId(campaign.id);
      return {
        data: tierRows.map((entry) => serializeTier(entry, benefitMap.get(entry.id) ?? [])),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      response: {
        200: campaignTierListResponse,
      },
      detail: {
        summary: "Listar tiers de campaña",
      },
    },
  )
  .post(
    "/:campaignId/tiers",
    async ({ auth, params, body, status }: CampaignTierCreateContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      if (campaign.status !== "draft" && campaign.status !== "rejected") {
        return status(409, {
          error: {
            code: "CAMPAIGN_LOCKED",
            message: "Solo campañas en draft o rejected permiten editar tiers",
          },
        });
      }

      if (!body.minPurchaseAmount && !body.minPurchaseCount) {
        return status(400, {
          error: {
            code: "INVALID_ARGUMENT",
            message: "Debes enviar minPurchaseCount o minPurchaseAmount",
          },
        });
      }

      const [created] = (await db
        .insert(campaignTiers)
        .values({
          campaignId: campaign.id,
          name: body.name,
          order: body.order,
          thresholdValue: body.thresholdValue,
          windowUnit: body.windowUnit ?? "day",
          windowValue: body.windowValue ?? 90,
          minPurchaseCount: body.minPurchaseCount ?? null,
          minPurchaseAmount: body.minPurchaseAmount ?? null,
          qualificationMode: body.qualificationMode ?? "any",
          graceDays: body.graceDays ?? 7,
          updatedAt: new Date(),
        })
        .returning()) as CampaignTierRow[];

      if (!created) {
        return status(500, {
          error: {
            code: "CAMPAIGN_TIER_CREATE_FAILED",
            message: "No se pudo crear el tier",
          },
        });
      }

      if (body.benefits && body.benefits.length > 0) {
        await db.insert(tierBenefits).values(
          body.benefits.map((benefit) => ({
            tierId: created.id,
            type: benefit.type,
            config: benefit.config ?? null,
            updatedAt: new Date(),
          })),
        );
      }

      const benefits = (await db
        .select()
        .from(tierBenefits)
        .where(eq(tierBenefits.tierId, created.id))) as TierBenefitRow[];
      await appendAudit(created.campaignId, "campaign.tier_created", null, auth, {
        tierId: created.id,
        order: created.order,
      });

      return status(201, {
        data: serializeTier(created, benefits),
      });
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      body: campaignTierCreateRequest,
      response: {
        201: campaignTierResponse,
      },
      detail: {
        summary: "Crear tier de campaña",
      },
    },
  )
  .patch(
    "/:campaignId/tiers/:tierId",
    async ({ auth, params, body, status }: CampaignTierUpdateContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      if (campaign.status !== "draft" && campaign.status !== "rejected") {
        return status(409, {
          error: {
            code: "CAMPAIGN_LOCKED",
            message: "Solo campañas en draft o rejected permiten editar tiers",
          },
        });
      }

      const [existing] = (await db
        .select()
        .from(campaignTiers)
        .where(
          and(eq(campaignTiers.id, params.tierId), eq(campaignTiers.campaignId, campaign.id)),
        )) as CampaignTierRow[];

      if (!existing) {
        return status(404, {
          error: {
            code: "CAMPAIGN_TIER_NOT_FOUND",
            message: "Tier no encontrado",
          },
        });
      }

      const nextCount = body.minPurchaseCount ?? existing.minPurchaseCount;
      const nextAmount = body.minPurchaseAmount ?? existing.minPurchaseAmount;
      if (!nextCount && !nextAmount) {
        return status(400, {
          error: {
            code: "INVALID_ARGUMENT",
            message: "Debes conservar minPurchaseCount o minPurchaseAmount",
          },
        });
      }

      const [updated] = (await db
        .update(campaignTiers)
        .set({
          name: body.name ?? existing.name,
          order: body.order ?? existing.order,
          thresholdValue: body.thresholdValue ?? existing.thresholdValue,
          windowUnit: body.windowUnit ?? existing.windowUnit,
          windowValue: body.windowValue ?? existing.windowValue,
          minPurchaseCount: nextCount,
          minPurchaseAmount: nextAmount,
          qualificationMode: body.qualificationMode ?? existing.qualificationMode,
          graceDays: body.graceDays ?? existing.graceDays,
          updatedAt: new Date(),
        })
        .where(eq(campaignTiers.id, existing.id))
        .returning()) as CampaignTierRow[];

      if (!updated) {
        return status(500, {
          error: {
            code: "CAMPAIGN_TIER_UPDATE_FAILED",
            message: "No se pudo actualizar el tier",
          },
        });
      }

      if (body.benefits) {
        await db.delete(tierBenefits).where(eq(tierBenefits.tierId, updated.id));
        if (body.benefits.length > 0) {
          await db.insert(tierBenefits).values(
            body.benefits.map((benefit) => ({
              tierId: updated.id,
              type: benefit.type,
              config: benefit.config ?? null,
              updatedAt: new Date(),
            })),
          );
        }
      }

      const benefits = (await db
        .select()
        .from(tierBenefits)
        .where(eq(tierBenefits.tierId, updated.id))) as TierBenefitRow[];
      await appendAudit(updated.campaignId, "campaign.tier_updated", null, auth, {
        tierId: updated.id,
        order: updated.order,
      });

      return {
        data: serializeTier(updated, benefits),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      body: campaignTierUpdateRequest,
      response: {
        200: campaignTierResponse,
      },
      detail: {
        summary: "Actualizar tier de campaña",
      },
    },
  )
  .delete(
    "/:campaignId/tiers/:tierId",
    async ({ auth, params, status }: CampaignTierDeleteContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      if (campaign.status !== "draft" && campaign.status !== "rejected") {
        return status(409, {
          error: {
            code: "CAMPAIGN_LOCKED",
            message: "Solo campañas en draft o rejected permiten editar tiers",
          },
        });
      }

      const [existing] = (await db
        .select({ id: campaignTiers.id, campaignId: campaignTiers.campaignId })
        .from(campaignTiers)
        .where(
          and(eq(campaignTiers.id, params.tierId), eq(campaignTiers.campaignId, campaign.id)),
        )) as Array<{
        id: string;
        campaignId: string;
      }>;

      if (!existing) {
        return status(404, {
          error: {
            code: "CAMPAIGN_TIER_NOT_FOUND",
            message: "Tier no encontrado",
          },
        });
      }

      await db.delete(campaignTiers).where(eq(campaignTiers.id, existing.id));
      await appendAudit(existing.campaignId, "campaign.tier_deleted", null, auth, {
        tierId: existing.id,
      });

      return new Response(null, { status: 204 });
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      detail: {
        summary: "Eliminar tier de campaña",
      },
    },
  )
  .post(
    "/:campaignId/ready-for-review",
    async ({ auth, params, body, status }: CampaignNoteContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      if (campaign.status !== "draft" && campaign.status !== "rejected") {
        return invalidTransition(status, campaign.status, "ready_for_review");
      }

      const [updated] = (await db
        .update(campaigns)
        .set({
          status: "ready_for_review",
          version: campaign.version + 1,
          updatedBy: resolveActorUserId(auth),
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaign.id))
        .returning()) as CampaignRow[];

      if (!updated) {
        return status(500, {
          error: {
            code: "CAMPAIGN_UPDATE_FAILED",
            message: "No se pudo actualizar la campaña",
          },
        });
      }

      await appendAudit(
        updated.id,
        "campaign.ready_for_review",
        body.reason ?? body.notes ?? null,
        auth,
      );

      return {
        data: serializeCampaign(updated),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      body: campaignNoteRequest,
      response: {
        200: campaignResponse,
      },
      detail: {
        summary: "Enviar campaña a revisión",
      },
    },
  )
  .post(
    "/:campaignId/review",
    async ({ auth, params, body, status }: CampaignReviewContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      if (campaign.status !== "ready_for_review") {
        return invalidTransition(status, campaign.status, "in_review/rejected");
      }

      const approved = body.approved ?? true;
      const nextStatus = approved ? "in_review" : "rejected";
      const [updated] = (await db
        .update(campaigns)
        .set({
          status: nextStatus,
          version: campaign.version + 1,
          updatedBy: resolveActorUserId(auth),
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaign.id))
        .returning()) as CampaignRow[];

      if (!updated) {
        return status(500, {
          error: {
            code: "CAMPAIGN_UPDATE_FAILED",
            message: "No se pudo actualizar la campaña",
          },
        });
      }

      await appendAudit(updated.id, "campaign.reviewed", body.notes ?? null, auth, {
        approved,
      });

      return {
        data: serializeCampaign(updated),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      body: campaignReviewRequest,
      response: {
        200: campaignResponse,
      },
      detail: {
        summary: "Revisar campaña",
      },
    },
  )
  .post(
    "/:campaignId/confirm",
    async ({ auth, params, body, status }: CampaignNoteContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      if (campaign.status !== "in_review") {
        return invalidTransition(status, campaign.status, "confirmed");
      }

      const [updated] = (await db
        .update(campaigns)
        .set({
          status: "confirmed",
          version: campaign.version + 1,
          updatedBy: resolveActorUserId(auth),
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaign.id))
        .returning()) as CampaignRow[];

      if (!updated) {
        return status(500, {
          error: {
            code: "CAMPAIGN_UPDATE_FAILED",
            message: "No se pudo actualizar la campaña",
          },
        });
      }

      await appendAudit(updated.id, "campaign.confirmed", body.notes ?? null, auth);

      return {
        data: serializeCampaign(updated),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      body: campaignNoteRequest,
      response: {
        200: campaignResponse,
      },
      detail: {
        summary: "Confirmar campaña",
      },
    },
  )
  .post(
    "/:campaignId/activate",
    async ({ auth, params, status }: CampaignParamsContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
          },
        });
      }

      if (campaign.status !== "confirmed") {
        return invalidTransition(status, campaign.status, "active");
      }

      const [updated] = (await db
        .update(campaigns)
        .set({
          status: "active",
          version: campaign.version + 1,
          updatedBy: resolveActorUserId(auth),
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaign.id))
        .returning()) as CampaignRow[];

      if (!updated) {
        return status(500, {
          error: {
            code: "CAMPAIGN_UPDATE_FAILED",
            message: "No se pudo actualizar la campaña",
          },
        });
      }

      await appendAudit(updated.id, "campaign.activated", null, auth);

      return {
        data: serializeCampaign(updated),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      response: {
        200: campaignResponse,
      },
      detail: {
        summary: "Activar campaña",
      },
    },
  )
  .get(
    "/:campaignId/audit-logs",
    async ({ auth, params, query, status }: CampaignAuditContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: "UNAUTHORIZED",
            message: "Autenticación requerida",
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: "CAMPAIGN_NOT_FOUND",
            message: "Campaña no encontrada",
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para esta campaña",
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

      const conditions = [eq(campaignAuditLogs.campaignId, params.campaignId)];
      if (cursorDate) {
        conditions.push(lt(campaignAuditLogs.createdAt, cursorDate));
      }

      const limit = parseLimit(query.limit);
      const rows = (await db
        .select()
        .from(campaignAuditLogs)
        .where(and(...conditions))
        .orderBy(desc(campaignAuditLogs.createdAt), desc(campaignAuditLogs.id))
        .limit(limit + 1)) as CampaignAuditRow[];

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : null;

      return {
        data: items.map(serializeAuditLog),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      query: campaignAuditQuery,
      response: {
        200: campaignAuditListResponse,
      },
      detail: {
        summary: "Listar auditoría de campaña",
      },
    },
  )
  // ========== STORE TARGETING / ENROLLMENT ==========
  .get(
    "/:campaignId/stores",
    async ({
      auth,
      params,
      query,
      status,
    }: CampaignParamsContext & { query: { limit?: string; cursor?: string; status?: string } }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: { code: "CAMPAIGN_NOT_FOUND", message: "Campaña no encontrada" },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: { code: "FORBIDDEN", message: "No tienes permisos para esta campaña" },
        });
      }

      const limit = parseLimit(query.limit ?? "50");
      const cursorDate = parseCursor(query.cursor);
      const conditions = [eq(campaignStoreEnrollments.campaignId, params.campaignId)];

      if (query.status) {
        conditions.push(
          eq(
            campaignStoreEnrollments.status,
            query.status as
              | "visible"
              | "invited"
              | "enrolled"
              | "declined"
              | "removed"
              | "suspended",
          ),
        );
      }
      if (cursorDate) {
        conditions.push(lt(campaignStoreEnrollments.updatedAt, cursorDate));
      }

      const rows = (await db
        .select({
          id: campaignStoreEnrollments.id,
          storeId: campaignStoreEnrollments.storeId,
          status: campaignStoreEnrollments.status,
          visibilitySource: campaignStoreEnrollments.visibilitySource,
          enrollmentSource: campaignStoreEnrollments.enrollmentSource,
          invitedAt: campaignStoreEnrollments.invitedAt,
          enrolledAt: campaignStoreEnrollments.enrolledAt,
          updatedAt: campaignStoreEnrollments.updatedAt,
          name: stores.name,
          code: stores.code,
          neighborhood: stores.neighborhood,
          city: stores.city,
          state: stores.state,
        })
        .from(campaignStoreEnrollments)
        .innerJoin(stores, eq(campaignStoreEnrollments.storeId, stores.id))
        .where(and(...conditions))
        .orderBy(desc(campaignStoreEnrollments.updatedAt), desc(campaignStoreEnrollments.id))
        .limit(limit + 1)) as Array<{
        id: string;
        storeId: string;
        status: string;
        visibilitySource: string;
        enrollmentSource: string | null;
        invitedAt: Date | null;
        enrolledAt: Date | null;
        updatedAt: Date;
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
        data: items.map((row) => ({
          storeId: row.storeId,
          storeName: row.name,
          storeCode: row.code,
          neighborhood: row.neighborhood ?? undefined,
          city: row.city ?? undefined,
          state: row.state ?? undefined,
          status: row.status,
          visibilitySource: row.visibilitySource,
          enrollmentSource: row.enrollmentSource ?? undefined,
          invitedAt: row.invitedAt?.toISOString() ?? undefined,
          enrolledAt: row.enrolledAt?.toISOString() ?? undefined,
        })),
        pagination: { hasMore, nextCursor: nextCursor ?? undefined },
      };
    },
    {
      beforeHandle: authGuard({ roles: allowedRoles }),
      response: { 200: campaignStoreListResponse },
      detail: { summary: "Listar tiendas de campaña" },
    },
  )
  .post(
    "/:campaignId/stores/target",
    async ({
      auth,
      params,
      body,
      status,
    }: CampaignParamsContext & {
      body: { storeIds: string[]; status?: string; source?: string };
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: { code: "CAMPAIGN_NOT_FOUND", message: "Campaña no encontrada" },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: { code: "FORBIDDEN", message: "No tienes permisos para esta campaña" },
        });
      }

      if (!campaign.cpgId) {
        return status(400, {
          error: { code: "INVALID_CAMPAIGN", message: "La campaña no tiene CPG asociado" },
        });
      }

      if (!body.storeIds || body.storeIds.length === 0) {
        return status(400, {
          error: { code: "INVALID_ARGUMENT", message: "Debes proporcionar al menos un storeId" },
        });
      }

      const actorUserId = resolveActorUserId(auth);
      const now = new Date();
      const targetStatus = body.status ?? "visible";
      const source = body.source ?? "manual";

      for (const storeId of body.storeIds) {
        const [existing] = (await db
          .select({ id: campaignStoreEnrollments.id })
          .from(campaignStoreEnrollments)
          .where(
            and(
              eq(campaignStoreEnrollments.campaignId, params.campaignId),
              eq(campaignStoreEnrollments.storeId, storeId),
            ),
          )
          .limit(1)) as Array<{ id: string }>;

        if (existing) {
          await db
            .update(campaignStoreEnrollments)
            .set({
              status: targetStatus as "visible" | "invited" | "enrolled",
              visibilitySource: source as "manual" | "zone" | "import",
              invitedAt: targetStatus === "invited" ? now : existing ? undefined : null,
              updatedAt: now,
            })
            .where(eq(campaignStoreEnrollments.id, existing.id));
        } else {
          await db.insert(campaignStoreEnrollments).values({
            campaignId: params.campaignId,
            storeId,
            status: targetStatus as "visible" | "invited" | "enrolled",
            visibilitySource: source as "manual" | "zone" | "import",
            invitedAt: targetStatus === "invited" ? now : null,
            invitedByUserId: actorUserId,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      return { data: { success: true, count: body.storeIds.length } };
    },
    {
      beforeHandle: authGuard({ roles: allowedRoles }),
      body: campaignStoreTargetRequest,
      detail: { summary: "Agregar tiendas a campaña" },
    },
  )
  .post(
    "/:campaignId/stores/:storeId/enroll",
    async ({
      auth,
      params,
      body,
      status,
    }: CampaignParamsContext & { body: { status: string } }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: { code: "CAMPAIGN_NOT_FOUND", message: "Campaña no encontrada" },
        });
      }

      // Allow both CPG admin (canAccessCampaign) and store operator
      const isCpgAccess = canAccessCampaign(auth, campaign);
      const isStoreOperator = auth.type === "jwt" || auth.type === "dev";
      const isStoreAccess =
        isStoreOperator &&
        (auth.role === "store_admin" || auth.role === "store_staff") &&
        auth.tenantType === "store" &&
        auth.tenantId === params.storeId;

      if (!isCpgAccess && !isStoreAccess) {
        return status(403, {
          error: { code: "FORBIDDEN", message: "No tienes permisos para esta campaña/tienda" },
        });
      }

      const actorUserId = resolveActorUserId(auth);
      const now = new Date();
      const targetStatus = body.status as
        | "enrolled"
        | "declined"
        | "visible"
        | "invited"
        | "removed"
        | "suspended";

      const [existing] = (await db
        .select()
        .from(campaignStoreEnrollments)
        .where(
          and(
            eq(campaignStoreEnrollments.campaignId, params.campaignId),
            eq(campaignStoreEnrollments.storeId, params.storeId),
          ),
        )
        .limit(1)) as Array<{
        id: string;
        status: string;
      }>;

      if (existing) {
        await db
          .update(campaignStoreEnrollments)
          .set({
            status: targetStatus,
            enrolledAt: targetStatus === "enrolled" ? now : null,
            declinedAt: targetStatus === "declined" ? now : null,
            removedAt: targetStatus === "removed" ? now : null,
            enrolledByUserId: targetStatus === "enrolled" ? actorUserId : null,
            updatedAt: now,
          })
          .where(eq(campaignStoreEnrollments.id, existing.id));
      } else {
        // Create new enrollment if doesn't exist
        await db.insert(campaignStoreEnrollments).values({
          campaignId: params.campaignId,
          storeId: params.storeId,
          status: targetStatus,
          visibilitySource: "manual",
          enrolledAt: targetStatus === "enrolled" ? now : null,
          declinedAt: targetStatus === "declined" ? now : null,
          enrolledByUserId: targetStatus === "enrolled" ? actorUserId : null,
          createdAt: now,
          updatedAt: now,
        });
      }

      return { data: { success: true, status: targetStatus } };
    },
    {
      beforeHandle: authGuard({
        roles: [...allowedRoles, "store_admin", "store_staff"],
        allowApiKey: true,
      }),
      body: campaignStoreEnrollRequest,
      detail: { summary: "Enrolar o actualizar tienda en campaña" },
    },
  )
  // ========== STORE-FACING: GET VISIBLE CAMPAIGNS FOR STORE ==========
  .get(
    "/stores/:storeId/campaigns",
    async ({
      auth,
      params,
      query,
      status,
    }: {
      auth: AuthContext | null;
      params: { storeId: string };
      query: { limit?: string; cursor?: string };
      status: StatusHandler;
    }) => {
      if (!auth) {
        return status(401, { error: { code: "UNAUTHORIZED", message: "Autenticación requerida" } });
      }

      // Allow store operator or CPG admin viewing their stores
      const isStoreOperator =
        (auth.type === "jwt" || auth.type === "dev") &&
        (auth.role === "store_admin" || auth.role === "store_staff") &&
        auth.tenantType === "store" &&
        auth.tenantId === params.storeId;
      const isCpgAccess =
        (auth.type === "jwt" || auth.type === "dev") &&
        auth.role === "cpg_admin" &&
        auth.tenantType === "cpg";

      if (
        !isStoreOperator &&
        !isCpgAccess &&
        !(auth.role === "qoa_admin" || auth.role === "qoa_support")
      ) {
        return status(403, {
          error: {
            code: "FORBIDDEN",
            message: "No tienes permisos para ver campañas de esta tienda",
          },
        });
      }

      const limit = parseLimit(query.limit ?? "50");
      const cursorDate = parseCursor(query.cursor);

      // Get related CPG IDs for this store
      const relatedCpgIds = await getRelatedCpgIdsForStore(params.storeId);

      if (relatedCpgIds.length === 0) {
        return { data: [], pagination: { hasMore: false } };
      }

      const conditions = [eq(campaigns.status, "active")];
      if (cursorDate) {
        conditions.push(lt(campaigns.createdAt, cursorDate));
      }

      const rows = (await db
        .select()
        .from(campaigns)
        .where(and(...conditions, ...relatedCpgIds.map((cpgId) => eq(campaigns.cpgId, cpgId))))
        .orderBy(desc(campaigns.createdAt), desc(campaigns.id))
        .limit(limit + 1)) as CampaignRow[];

      // Filter to only visible campaigns
      const visibleCampaigns: CampaignRow[] = [];
      for (const campaign of rows) {
        const isVisible = await isStoreVisibleForCampaign({
          campaignId: campaign.id,
          storeId: params.storeId,
        });
        if (isVisible) {
          visibleCampaigns.push(campaign);
        }
        if (visibleCampaigns.length >= limit) break;
      }

      const hasMore = visibleCampaigns.length > limit;
      const items = hasMore ? visibleCampaigns.slice(0, limit) : visibleCampaigns;
      const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : null;

      return {
        data: items.map((item) => serializeCampaign(item)),
        pagination: { hasMore, nextCursor: nextCursor ?? undefined },
      };
    },
    {
      beforeHandle: authGuard({
        roles: ["store_admin", "store_staff", "cpg_admin", "qoa_admin", "qoa_support"],
        allowApiKey: true,
      }),
      response: { 200: campaignListResponse },
      detail: { summary: "Listar campañas visibles para una tienda" },
    },
  );
