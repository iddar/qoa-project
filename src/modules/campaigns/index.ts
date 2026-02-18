import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { authGuard, authPlugin, type AuthContext } from '../../app/plugins/auth';
import { authorizationHeader } from '../../app/plugins/schemas';
import { parseCursor, parseLimit } from '../../app/utils/pagination';
import { db } from '../../db/client';
import { brands, campaignAuditLogs, campaignPolicies, campaignSubscriptions, campaigns, products } from '../../db/schema';
import type { StatusHandler } from '../../types/handlers';
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
  campaignPolicyListResponse,
  campaignPolicyResponse,
  campaignPolicyUpdateRequest,
  campaignResponse,
  campaignReviewRequest,
  campaignUpdateRequest,
} from './model';

const allowedRoles = ['cpg_admin', 'qoa_support', 'qoa_admin'] as const;

type CampaignRow = {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  cpgId: string | null;
  status: string;
  enrollmentMode: 'open' | 'opt_in' | 'system_universal';
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
  policyType: 'max_accumulations' | 'min_amount' | 'min_quantity' | 'cooldown';
  scopeType: 'campaign' | 'brand' | 'product';
  scopeId: string | null;
  scopeBrandId: string | null;
  scopeProductId: string | null;
  period: 'transaction' | 'day' | 'week' | 'month' | 'lifetime';
  value: number;
  config: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date | null;
};

type CampaignListContext = {
  auth: AuthContext | null;
  query: {
    status?: string;
    cpgId?: string;
    enrollmentMode?: 'open' | 'opt_in' | 'system_universal';
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
    enrollmentMode?: 'open' | 'opt_in' | 'system_universal';
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
    enrollmentMode?: 'open' | 'opt_in' | 'system_universal';
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
    policyType: CampaignPolicyRow['policyType'];
    scopeType: CampaignPolicyRow['scopeType'];
    scopeId?: string;
    period: CampaignPolicyRow['period'];
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
    policyType?: CampaignPolicyRow['policyType'];
    scopeType?: CampaignPolicyRow['scopeType'];
    scopeId?: string;
    period?: CampaignPolicyRow['period'];
    value?: number;
    config?: string;
    active?: boolean;
  };
  status: StatusHandler;
};

const isUserAuth = (auth: AuthContext): auth is Extract<AuthContext, { type: 'jwt' | 'dev' }> =>
  auth.type === 'jwt' || auth.type === 'dev';

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const serializeCampaign = (campaign: CampaignRow) => ({
  id: campaign.id,
  key: campaign.key ?? undefined,
  name: campaign.name,
  description: campaign.description ?? undefined,
  cpgId: campaign.cpgId ?? undefined,
  status: campaign.status,
  enrollmentMode: campaign.enrollmentMode,
  startsAt: campaign.startsAt ? campaign.startsAt.toISOString() : undefined,
  endsAt: campaign.endsAt ? campaign.endsAt.toISOString() : undefined,
  version: campaign.version,
  createdBy: campaign.createdBy ?? undefined,
  updatedBy: campaign.updatedBy ?? undefined,
  createdAt: campaign.createdAt.toISOString(),
  updatedAt: campaign.updatedAt ? campaign.updatedAt.toISOString() : undefined,
});

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

const resolveActorUserId = (auth: AuthContext | null) => {
  if (!auth || !isUserAuth(auth)) {
    return null;
  }

  return isUuid(auth.userId) ? auth.userId : null;
};

const canAccessCampaign = (auth: AuthContext, campaign: CampaignRow) => {
  if (auth.type === 'jwt' || auth.type === 'dev') {
    if (auth.role === 'qoa_admin' || auth.role === 'qoa_support') {
      return true;
    }

    if (auth.role === 'cpg_admin') {
      return Boolean(auth.tenantType === 'cpg' && auth.tenantId && campaign.cpgId === auth.tenantId);
    }

    return false;
  }

  if (auth.type === 'api_key' || auth.type === 'dev_api_key') {
    return auth.tenantType === 'cpg' && campaign.cpgId === auth.tenantId;
  }

  return false;
};

const canCreateForCpg = (auth: AuthContext, cpgId: string | null) => {
  if (auth.type === 'jwt' || auth.type === 'dev') {
    if (auth.role === 'qoa_admin' || auth.role === 'qoa_support') {
      return true;
    }

    if (auth.role === 'cpg_admin') {
      return Boolean(auth.tenantType === 'cpg' && auth.tenantId && cpgId === auth.tenantId);
    }

    return false;
  }

  if (auth.type === 'api_key' || auth.type === 'dev_api_key') {
    return auth.tenantType === 'cpg' && cpgId === auth.tenantId;
  }

  return false;
};

const ensureCampaign = async (campaignId: string) => {
  const [campaign] = (await db.select().from(campaigns).where(eq(campaigns.id, campaignId))) as CampaignRow[];
  return campaign ?? null;
};

const ensureScope = async (
  campaign: CampaignRow,
  scopeType: CampaignPolicyRow['scopeType'],
  scopeId: string | null,
  status: StatusHandler,
) => {
  if (scopeType === 'campaign') {
    if (scopeId) {
      return status(400, {
        error: {
          code: 'INVALID_ARGUMENT',
          message: 'scopeId debe omitirse cuando scopeType es campaign',
        },
      });
    }
    return null;
  }

  if (!scopeId) {
    return status(400, {
      error: {
        code: 'INVALID_ARGUMENT',
        message: 'scopeId es obligatorio para scopeType brand/product',
      },
    });
  }

  if (!isUuid(scopeId)) {
    return status(400, {
      error: {
        code: 'INVALID_ARGUMENT',
        message: 'scopeId debe ser UUID válido',
      },
    });
  }

  if (scopeType === 'brand') {
    const [brand] = (await db
      .select({ id: brands.id, cpgId: brands.cpgId })
      .from(brands)
      .where(eq(brands.id, scopeId))) as Array<{ id: string; cpgId: string }>;

    if (!brand) {
      return status(404, {
        error: {
          code: 'BRAND_NOT_FOUND',
          message: 'Brand no encontrada',
        },
      });
    }

    if (campaign.cpgId && campaign.cpgId !== brand.cpgId) {
      return status(400, {
        error: {
          code: 'INVALID_ARGUMENT',
          message: 'La brand no pertenece al CPG de la campaña',
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
        code: 'PRODUCT_NOT_FOUND',
        message: 'Producto no encontrado',
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
          code: 'INVALID_ARGUMENT',
          message: 'El producto no pertenece al CPG de la campaña',
        },
      });
    }
  }

  return null;
};

const parsePolicyConfig = (config: string | undefined) => (config === undefined || config === '' ? null : config);

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
      code: 'INVALID_STATUS_TRANSITION',
      message: `No se puede mover de ${fromStatus} a ${toStatus}`,
    },
  });

export const campaignsModule = new Elysia({
  prefix: '/campaigns',
  detail: {
    tags: ['Campaigns'],
  },
})
  .use(authPlugin)
  .get(
    '/discover',
    async ({ auth, status }: CampaignSubscriptionsMeContext) => {
      if (!auth || !isUserAuth(auth)) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
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
          startsAt: campaigns.startsAt,
          endsAt: campaigns.endsAt,
          version: campaigns.version,
          createdBy: campaigns.createdBy,
          updatedBy: campaigns.updatedBy,
          createdAt: campaigns.createdAt,
          updatedAt: campaigns.updatedAt,
        })
        .from(campaigns)
        .where(and(eq(campaigns.status, 'active')))
        .orderBy(desc(campaigns.createdAt))) as CampaignRow[];

      const filtered = rows.filter((row) => row.enrollmentMode !== 'system_universal');
      return {
        data: filtered.map(serializeCampaign),
        pagination: {
          hasMore: false,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: ['consumer', 'customer'] }),
      headers: authorizationHeader,
      response: {
        200: campaignListResponse,
      },
      detail: {
        summary: 'Descubrir campañas para wallet',
      },
    },
  )
  .get(
    '/subscriptions/me',
    async ({ auth, status }: CampaignSubscriptionsMeContext) => {
      if (!auth || !isUserAuth(auth)) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const rows = (await db.execute(sql`
        select
          cs.campaign_id as "campaignId",
          c.name as "campaignName",
          c.enrollment_mode as "enrollmentMode",
          cs.status,
          cs.subscribed_at as "subscribedAt"
        from campaign_subscriptions cs
        inner join campaigns c on c.id = cs.campaign_id
        where cs.user_id = ${auth.userId}
        order by cs.created_at desc
      `)) as Array<{
        campaignId: string;
        campaignName: string;
        enrollmentMode: 'open' | 'opt_in' | 'system_universal';
        status: string;
        subscribedAt: Date | null;
      }>;

      return {
        data: rows.map((row) => ({
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          enrollmentMode: row.enrollmentMode,
          status: row.status,
          subscribedAt:
            row.subscribedAt instanceof Date
              ? row.subscribedAt.toISOString()
              : typeof row.subscribedAt === 'string'
                ? new Date(row.subscribedAt).toISOString()
                : undefined,
        })),
      };
    },
    {
      beforeHandle: authGuard({ roles: ['consumer', 'customer'] }),
      headers: authorizationHeader,
      response: {
        200: campaignSubscriptionListResponse,
      },
      detail: {
        summary: 'Listar suscripciones de campañas del usuario',
      },
    },
  )
  .post(
    '/:campaignId/subscribe',
    async ({ auth, params, status }: CampaignSubscribeContext) => {
      if (!auth || !isUserAuth(auth)) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const [campaign] = (await db
        .select({ id: campaigns.id, status: campaigns.status, enrollmentMode: campaigns.enrollmentMode })
        .from(campaigns)
        .where(eq(campaigns.id, params.campaignId))) as Array<{
        id: string;
        status: string;
        enrollmentMode: 'open' | 'opt_in' | 'system_universal';
      }>;

      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      if (campaign.status !== 'active') {
        return status(422, {
          error: {
            code: 'CAMPAIGN_NOT_ACTIVE',
            message: 'Solo se permiten suscripciones a campañas activas',
          },
        });
      }

      const now = new Date();
      const [existing] = (await db
        .select({ id: campaignSubscriptions.id })
        .from(campaignSubscriptions)
        .where(and(eq(campaignSubscriptions.userId, auth.userId), eq(campaignSubscriptions.campaignId, campaign.id)))) as Array<{
        id: string;
      }>;

      if (existing) {
        await db
          .update(campaignSubscriptions)
          .set({
            status: 'subscribed',
            subscribedAt: now,
            leftAt: null,
            updatedAt: now,
          })
          .where(eq(campaignSubscriptions.id, existing.id));
      } else {
        await db.insert(campaignSubscriptions).values({
          userId: auth.userId,
          campaignId: campaign.id,
          status: 'subscribed',
          invitedAt: campaign.enrollmentMode === 'opt_in' ? now : null,
          subscribedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      return {
        data: {
          campaignId: campaign.id,
          status: 'subscribed',
          subscribedAt: now.toISOString(),
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: ['consumer', 'customer'] }),
      headers: authorizationHeader,
      response: {
        200: campaignSubscribeResponse,
      },
      detail: {
        summary: 'Suscribirse a campaña',
      },
    },
  )
  .get(
    '/',
    async ({ auth, query, status }: CampaignListContext) => {
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

      if (auth.type === 'jwt' || auth.type === 'dev') {
        if (auth.role === 'cpg_admin') {
          if (!auth.tenantId || auth.tenantType !== 'cpg') {
            return status(403, {
              error: {
                code: 'FORBIDDEN',
                message: 'Tenant inválido para cpg_admin',
              },
            });
          }
          conditions.push(eq(campaigns.cpgId, auth.tenantId));
        }
      } else if (auth.type === 'api_key' || auth.type === 'dev_api_key') {
        if (auth.tenantType !== 'cpg') {
          return status(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'Solo API keys de CPG pueden listar campañas',
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
        data: items.map(serializeCampaign),
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
        summary: 'Listar campañas',
      },
    },
  )
  .post(
    '/',
    async ({ auth, body, status }: CampaignCreateContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const startsAt = body.startsAt ? new Date(body.startsAt) : null;
      const endsAt = body.endsAt ? new Date(body.endsAt) : null;

      if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) {
        return status(400, {
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'Fechas inválidas',
          },
        });
      }

      if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
        return status(400, {
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'startsAt debe ser menor que endsAt',
          },
        });
      }

      const cpgId = body.cpgId ?? null;
      if (!canCreateForCpg(auth, cpgId)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No puedes crear campañas para este CPG',
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
          enrollmentMode: body.enrollmentMode ?? 'opt_in',
          startsAt,
          endsAt,
          createdBy: resolveActorUserId(auth),
          updatedBy: resolveActorUserId(auth),
        })
        .returning()) as CampaignRow[];

      if (!created) {
        return status(500, {
          error: {
            code: 'CAMPAIGN_CREATE_FAILED',
            message: 'No se pudo crear la campaña',
          },
        });
      }

      await appendAudit(created.id, 'campaign.created', null, auth, {
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
        summary: 'Crear campaña',
      },
    },
  )
  .get(
    '/:campaignId',
    async ({ auth, params, status }: CampaignParamsContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes permisos para esta campaña',
          },
        });
      }

      return {
        data: serializeCampaign(campaign),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      response: {
        200: campaignResponse,
      },
      detail: {
        summary: 'Obtener campaña',
      },
    },
  )
  .patch(
    '/:campaignId',
    async ({ auth, params, body, status }: CampaignUpdateContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes permisos para esta campaña',
          },
        });
      }

      if (campaign.status !== 'draft' && campaign.status !== 'rejected') {
        return status(409, {
          error: {
            code: 'CAMPAIGN_LOCKED',
            message: 'Solo campañas en draft o rejected pueden editarse',
          },
        });
      }

      const startsAt = body.startsAt ? new Date(body.startsAt) : campaign.startsAt;
      const endsAt = body.endsAt ? new Date(body.endsAt) : campaign.endsAt;
      if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) {
        return status(400, {
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'Fechas inválidas',
          },
        });
      }

      if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
        return status(400, {
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'startsAt debe ser menor que endsAt',
          },
        });
      }

      const [updated] = (await db
        .update(campaigns)
          .set({
            name: body.name ?? campaign.name,
            description: body.description ?? campaign.description,
            enrollmentMode: body.enrollmentMode ?? campaign.enrollmentMode,
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
            code: 'CAMPAIGN_UPDATE_FAILED',
            message: 'No se pudo actualizar la campaña',
          },
        });
      }

      await appendAudit(updated.id, 'campaign.updated', null, auth, {
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
        summary: 'Actualizar campaña',
      },
    },
  )
  .get(
    '/:campaignId/policies',
    async ({ auth, params, status }: CampaignPolicyListContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes permisos para esta campaña',
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
        summary: 'Listar políticas de campaña',
      },
    },
  )
  .post(
    '/:campaignId/policies',
    async ({ auth, params, body, status }: CampaignPolicyCreateContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes permisos para esta campaña',
          },
        });
      }

      if (campaign.status !== 'draft' && campaign.status !== 'rejected') {
        return status(409, {
          error: {
            code: 'CAMPAIGN_LOCKED',
            message: 'Solo campañas en draft o rejected permiten editar políticas',
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
          scopeBrandId: body.scopeType === 'brand' ? scopeId : null,
          scopeProductId: body.scopeType === 'product' ? scopeId : null,
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
            code: 'CAMPAIGN_POLICY_CREATE_FAILED',
            message: 'No se pudo crear la política de campaña',
          },
        });
      }

      await appendAudit(created.campaignId, 'campaign.policy_created', null, auth, {
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
        summary: 'Crear política de campaña',
      },
    },
  )
  .patch(
    '/:campaignId/policies/:policyId',
    async ({ auth, params, body, status }: CampaignPolicyUpdateContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes permisos para esta campaña',
          },
        });
      }

      if (campaign.status !== 'draft' && campaign.status !== 'rejected') {
        return status(409, {
          error: {
            code: 'CAMPAIGN_LOCKED',
            message: 'Solo campañas en draft o rejected permiten editar políticas',
          },
        });
      }

      const [existing] = (await db
        .select()
        .from(campaignPolicies)
        .where(and(eq(campaignPolicies.id, params.policyId), eq(campaignPolicies.campaignId, campaign.id)))) as
        | CampaignPolicyRow[]
        | [];

      if (!existing) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_POLICY_NOT_FOUND',
            message: 'Política no encontrada',
          },
        });
      }

      const nextScopeType = body.scopeType ?? existing.scopeType;
      const nextScopeId =
        body.scopeType === 'campaign'
          ? null
          : body.scopeId !== undefined
            ? body.scopeId
            : existing.scopeType === 'campaign'
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
          scopeBrandId: nextScopeType === 'brand' ? (nextScopeId ?? null) : null,
          scopeProductId: nextScopeType === 'product' ? (nextScopeId ?? null) : null,
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
            code: 'CAMPAIGN_POLICY_UPDATE_FAILED',
            message: 'No se pudo actualizar la política de campaña',
          },
        });
      }

      await appendAudit(updated.campaignId, 'campaign.policy_updated', null, auth, {
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
        summary: 'Actualizar política de campaña',
      },
    },
  )
  .post(
    '/:campaignId/ready-for-review',
    async ({ auth, params, body, status }: CampaignNoteContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes permisos para esta campaña',
          },
        });
      }

      if (campaign.status !== 'draft' && campaign.status !== 'rejected') {
        return invalidTransition(status, campaign.status, 'ready_for_review');
      }

      const [updated] = (await db
        .update(campaigns)
        .set({
          status: 'ready_for_review',
          version: campaign.version + 1,
          updatedBy: resolveActorUserId(auth),
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaign.id))
        .returning()) as CampaignRow[];

      if (!updated) {
        return status(500, {
          error: {
            code: 'CAMPAIGN_UPDATE_FAILED',
            message: 'No se pudo actualizar la campaña',
          },
        });
      }

      await appendAudit(updated.id, 'campaign.ready_for_review', body.reason ?? body.notes ?? null, auth);

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
        summary: 'Enviar campaña a revisión',
      },
    },
  )
  .post(
    '/:campaignId/review',
    async ({ auth, params, body, status }: CampaignReviewContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes permisos para esta campaña',
          },
        });
      }

      if (campaign.status !== 'ready_for_review') {
        return invalidTransition(status, campaign.status, 'in_review/rejected');
      }

      const approved = body.approved ?? true;
      const nextStatus = approved ? 'in_review' : 'rejected';
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
            code: 'CAMPAIGN_UPDATE_FAILED',
            message: 'No se pudo actualizar la campaña',
          },
        });
      }

      await appendAudit(updated.id, 'campaign.reviewed', body.notes ?? null, auth, {
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
        summary: 'Revisar campaña',
      },
    },
  )
  .post(
    '/:campaignId/confirm',
    async ({ auth, params, body, status }: CampaignNoteContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes permisos para esta campaña',
          },
        });
      }

      if (campaign.status !== 'in_review') {
        return invalidTransition(status, campaign.status, 'confirmed');
      }

      const [updated] = (await db
        .update(campaigns)
        .set({
          status: 'confirmed',
          version: campaign.version + 1,
          updatedBy: resolveActorUserId(auth),
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaign.id))
        .returning()) as CampaignRow[];

      if (!updated) {
        return status(500, {
          error: {
            code: 'CAMPAIGN_UPDATE_FAILED',
            message: 'No se pudo actualizar la campaña',
          },
        });
      }

      await appendAudit(updated.id, 'campaign.confirmed', body.notes ?? null, auth);

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
        summary: 'Confirmar campaña',
      },
    },
  )
  .post(
    '/:campaignId/activate',
    async ({ auth, params, status }: CampaignParamsContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes permisos para esta campaña',
          },
        });
      }

      if (campaign.status !== 'confirmed') {
        return invalidTransition(status, campaign.status, 'active');
      }

      const [updated] = (await db
        .update(campaigns)
        .set({
          status: 'active',
          version: campaign.version + 1,
          updatedBy: resolveActorUserId(auth),
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaign.id))
        .returning()) as CampaignRow[];

      if (!updated) {
        return status(500, {
          error: {
            code: 'CAMPAIGN_UPDATE_FAILED',
            message: 'No se pudo actualizar la campaña',
          },
        });
      }

      await appendAudit(updated.id, 'campaign.activated', null, auth);

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
        summary: 'Activar campaña',
      },
    },
  )
  .get(
    '/:campaignId/audit-logs',
    async ({ auth, params, query, status }: CampaignAuditContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const campaign = await ensureCampaign(params.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      if (!canAccessCampaign(auth, campaign)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes permisos para esta campaña',
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
        summary: 'Listar auditoría de campaña',
      },
    },
  );
