import { and, desc, eq, lt } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { authGuard, authPlugin, type AuthContext } from '../../app/plugins/auth';
import { parseCursor, parseLimit } from '../../app/utils/pagination';
import { db } from '../../db/client';
import { campaignAuditLogs, campaigns } from '../../db/schema';
import type { StatusHandler } from '../../types/handlers';
import {
  campaignAuditListResponse,
  campaignAuditQuery,
  campaignCreateRequest,
  campaignListQuery,
  campaignListResponse,
  campaignNoteRequest,
  campaignResponse,
  campaignReviewRequest,
  campaignUpdateRequest,
} from './model';

const allowedRoles = ['cpg_admin', 'qoa_support', 'qoa_admin'] as const;
const headerSchema = t.Object({
  authorization: t.Optional(
    t.String({
      description: 'Bearer <accessToken>',
    }),
  ),
});

type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
  cpgId: string | null;
  status: string;
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

type CampaignListContext = {
  auth: AuthContext | null;
  query: {
    status?: string;
    cpgId?: string;
    limit?: string;
    cursor?: string;
  };
  status: StatusHandler;
};

type CampaignCreateContext = {
  auth: AuthContext | null;
  body: {
    name: string;
    description?: string;
    cpgId?: string;
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
    startsAt?: string;
    endsAt?: string;
    status?: string;
  };
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

const isUserAuth = (auth: AuthContext): auth is Extract<AuthContext, { type: 'jwt' | 'dev' }> =>
  auth.type === 'jwt' || auth.type === 'dev';

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const serializeCampaign = (campaign: CampaignRow) => ({
  id: campaign.id,
  name: campaign.name,
  description: campaign.description ?? undefined,
  cpgId: campaign.cpgId ?? undefined,
  status: campaign.status,
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
      headers: headerSchema,
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
          name: body.name,
          description: body.description ?? null,
          cpgId,
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
      headers: headerSchema,
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
      headers: headerSchema,
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
      headers: headerSchema,
      body: campaignUpdateRequest,
      response: {
        200: campaignResponse,
      },
      detail: {
        summary: 'Actualizar campaña',
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
      headers: headerSchema,
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
      headers: headerSchema,
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
      headers: headerSchema,
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
      headers: headerSchema,
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
      headers: headerSchema,
      query: campaignAuditQuery,
      response: {
        200: campaignAuditListResponse,
      },
      detail: {
        summary: 'Listar auditoría de campaña',
      },
    },
  );
