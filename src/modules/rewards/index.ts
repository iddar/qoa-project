import { and, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { authGuard, authPlugin, type AuthContext } from '../../app/plugins/auth';
import { allUserRoles } from '../../app/plugins/roles';
import { authorizationHeader } from '../../app/plugins/schemas';
import { parseCursor, parseLimit } from '../../app/utils/pagination';
import { db, type Database } from '../../db/client';
import { balances, campaignBalances, campaigns, campaignTiers, cards, redemptions, rewards } from '../../db/schema';
import { evaluateCardTier } from '../../services/tier-engine';
import type { StatusHandler } from '../../types/handlers';
import {
  redemptionResponse,
  rewardCreateRequest,
  rewardListQuery,
  rewardListResponse,
  rewardRedeemRequest,
  rewardResponse,
} from './model';

const allowedRoles = allUserRoles;
const adminRoles = ['store_admin', 'cpg_admin', 'qoa_support', 'qoa_admin'] as const;

type RewardRow = {
  id: string;
  campaignId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  cost: number;
  minTierId: string | null;
  stock: number | null;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date | null;
};

type CardBalanceRow = {
  cardId: string;
  campaignId: string;
  current: number;
  lifetime: number;
};

type RedeemFailureCode = 'ALREADY_REDEEMED' | 'INSUFFICIENT_BALANCE' | 'REWARD_OUT_OF_STOCK';

type RedeemFailure = Error & {
  redeemCode?: RedeemFailureCode;
};

type CampaignScopeRow = {
  id: string;
  cpgId: string | null;
};

type RewardListContext = {
  auth: AuthContext | null;
  query: {
    campaignId?: string;
    available?: string;
    limit?: string;
    cursor?: string;
  };
  status: StatusHandler;
};

type RewardCreateContext = {
  auth: AuthContext | null;
  body: {
    campaignId: string;
    name: string;
    description?: string;
    imageUrl?: string;
    cost: number;
    minTierId?: string;
    stock?: number;
    status?: 'active' | 'inactive';
  };
  status: StatusHandler;
};

type RewardParamsContext = {
  auth: AuthContext | null;
  params: { rewardId: string };
  status: StatusHandler;
};

type RewardRedeemContext = {
  auth: AuthContext | null;
  params: { rewardId: string };
  body: { cardId: string };
  status: StatusHandler;
};

const serializeReward = (reward: RewardRow) => ({
  id: reward.id,
  campaignId: reward.campaignId,
  name: reward.name,
  description: reward.description ?? undefined,
  imageUrl: reward.imageUrl ?? undefined,
  cost: reward.cost,
  minTierId: reward.minTierId ?? undefined,
  stock: reward.stock ?? undefined,
  status: reward.status,
  createdAt: reward.createdAt.toISOString(),
  updatedAt: reward.updatedAt ? reward.updatedAt.toISOString() : undefined,
});

const executeRows = async <T>(database: Database, query: unknown) => (await database.execute(query)) as T[];

const throwRedeemFailure = (code: RedeemFailureCode): never => {
  const error = new Error(code) as RedeemFailure;
  error.redeemCode = code;
  throw error;
};

const isDuplicateKeyError = (error: unknown) => {
  const candidate = error as { code?: string; message?: string };
  return candidate.code === '23505' || candidate.message?.includes('duplicate key value');
};

const ensureReward = async (rewardId: string) => {
  const [reward] = (await db.select().from(rewards).where(eq(rewards.id, rewardId))) as RewardRow[];
  return reward ?? null;
};

const ensureCampaignExists = async (campaignId: string) => {
  const [campaign] = (await db
    .select({ id: campaigns.id, cpgId: campaigns.cpgId })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))) as CampaignScopeRow[];
  return campaign ?? null;
};

const isTruthy = (value?: string) => ['1', 'true', 'yes'].includes((value ?? '').toLowerCase());

const isCpgScopedAuth = (auth: AuthContext) => {
  if (auth.type === 'api_key' || auth.type === 'dev_api_key') {
    return auth.tenantType === 'cpg';
  }

  return auth.type === 'jwt' || auth.type === 'dev' ? auth.role === 'cpg_admin' && auth.tenantType === 'cpg' : false;
};

const validateCampaignScope = (auth: AuthContext, campaign: CampaignScopeRow, status: StatusHandler) => {
  if (!isCpgScopedAuth(auth)) {
    return null;
  }

  if (!auth.tenantId) {
    return status(403, {
      error: {
        code: 'FORBIDDEN',
        message: 'Usuario CPG sin tenant asociado',
      },
    });
  }

  if (campaign.cpgId !== auth.tenantId) {
    return status(403, {
      error: {
        code: 'FORBIDDEN',
        message: 'No puedes operar recompensas de otro CPG',
      },
    });
  }

  return null;
};

export const rewardsModule = new Elysia({
  prefix: '/rewards',
  detail: {
    tags: ['Rewards'],
  },
})
  .use(authPlugin)
  .get(
    '/',
    async ({ auth, query, status }: RewardListContext) => {
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
      if (isCpgScopedAuth(auth) && !auth.tenantId) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'Usuario CPG sin tenant asociado',
          },
        });
      }

      if (query.campaignId) {
        const campaign = await ensureCampaignExists(query.campaignId);
        if (!campaign) {
          return status(404, {
            error: {
              code: 'CAMPAIGN_NOT_FOUND',
              message: 'Campaña no encontrada',
            },
          });
        }

        const scopeError = validateCampaignScope(auth, campaign, status);
        if (scopeError) {
          return scopeError;
        }

        conditions.push(eq(rewards.campaignId, query.campaignId));
      } else if (isCpgScopedAuth(auth) && auth.tenantId) {
        const tenantCampaignRows = (await db
          .select({ id: campaigns.id })
          .from(campaigns)
          .where(eq(campaigns.cpgId, auth.tenantId))) as Array<{ id: string }>;

        const tenantCampaignIds = tenantCampaignRows.map((item) => item.id);
        if (tenantCampaignIds.length === 0) {
          return {
            data: [],
            pagination: {
              hasMore: false,
              nextCursor: undefined,
            },
          };
        }

        conditions.push(
          tenantCampaignIds.length === 1
            ? eq(rewards.campaignId, tenantCampaignIds[0] ?? '')
            : or(...tenantCampaignIds.map((campaignId) => eq(rewards.campaignId, campaignId))),
        );
      }

      if (isTruthy(query.available)) {
        conditions.push(eq(rewards.status, 'active'));
        conditions.push(or(gt(rewards.stock, 0), eq(rewards.stock, null)));
      }

      if (cursorDate) {
        conditions.push(lt(rewards.createdAt, cursorDate));
      }

      const limit = parseLimit(query.limit);
      let queryBuilder = db.select().from(rewards);
      if (conditions.length > 0) {
        queryBuilder = queryBuilder.where(and(...conditions));
      }

      const rows = (await queryBuilder
        .orderBy(desc(rewards.createdAt), desc(rewards.id))
        .limit(limit + 1)) as RewardRow[];
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : null;

      return {
        data: items.map(serializeReward),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      query: rewardListQuery,
      response: {
        200: rewardListResponse,
      },
      detail: {
        summary: 'Listar recompensas',
      },
    },
  )
  .post(
    '/',
    async ({ auth, body, status }: RewardCreateContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const campaign = await ensureCampaignExists(body.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      const scopeError = validateCampaignScope(auth, campaign, status);
      if (scopeError) {
        return scopeError;
      }

      if (body.minTierId) {
        const [tier] = (await db
          .select({ id: campaignTiers.id, campaignId: campaignTiers.campaignId })
          .from(campaignTiers)
          .where(eq(campaignTiers.id, body.minTierId))) as Array<{ id: string; campaignId: string }>;

        if (!tier || tier.campaignId !== body.campaignId) {
          return status(422, {
            error: {
              code: 'REWARD_MIN_TIER_INVALID',
              message: 'El tier mínimo no pertenece a la campaña seleccionada',
            },
          });
        }
      }

      const [created] = (await db
        .insert(rewards)
        .values({
          campaignId: body.campaignId,
          name: body.name,
          description: body.description ?? null,
          imageUrl: body.imageUrl ?? null,
          cost: body.cost,
          minTierId: body.minTierId ?? null,
          stock: body.stock ?? null,
          status: body.status ?? 'active',
          updatedAt: new Date(),
        })
        .returning()) as RewardRow[];

      if (!created) {
        return status(500, {
          error: {
            code: 'REWARD_CREATE_FAILED',
            message: 'No se pudo crear la recompensa',
          },
        });
      }

      return status(201, {
        data: serializeReward(created),
      });
    },
    {
      beforeHandle: authGuard({ roles: [...adminRoles], allowApiKey: true }),
      headers: authorizationHeader,
      body: rewardCreateRequest,
      response: {
        201: rewardResponse,
      },
      detail: {
        summary: 'Crear recompensa',
      },
    },
  )
  .get(
    '/:rewardId',
    async ({ auth, params, status }: RewardParamsContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const reward = await ensureReward(params.rewardId);
      if (!reward) {
        return status(404, {
          error: {
            code: 'REWARD_NOT_FOUND',
            message: 'Recompensa no encontrada',
          },
        });
      }

      const campaign = await ensureCampaignExists(reward.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      const scopeError = validateCampaignScope(auth, campaign, status);
      if (scopeError) {
        return scopeError;
      }

      return {
        data: serializeReward(reward),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      response: {
        200: rewardResponse,
      },
      detail: {
        summary: 'Obtener recompensa',
      },
    },
  )
  .post(
    '/:rewardId/redeem',
    async ({ auth, params, body, status }: RewardRedeemContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const reward = await ensureReward(params.rewardId);
      if (!reward) {
        return status(404, {
          error: {
            code: 'REWARD_NOT_FOUND',
            message: 'Recompensa no encontrada',
          },
        });
      }

      const campaign = await ensureCampaignExists(reward.campaignId);
      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      const scopeError = validateCampaignScope(auth, campaign, status);
      if (scopeError) {
        return scopeError;
      }

      if (reward.status !== 'active') {
        return status(422, {
          error: {
            code: 'REWARD_INACTIVE',
            message: 'La recompensa no está activa',
          },
        });
      }

      const [card] = (await db
        .select({
          cardId: cards.id,
          campaignId: cards.campaignId,
          currentTierId: cards.currentTierId,
        })
        .from(cards)
        .where(eq(cards.id, body.cardId))) as Array<{
        cardId: string;
        campaignId: string;
        currentTierId: string | null;
      }>;

      if (!card) {
        return status(404, {
          error: {
            code: 'CARD_NOT_FOUND',
            message: 'Tarjeta no encontrada',
          },
        });
      }

      if (card.campaignId !== reward.campaignId) {
        return status(422, {
          error: {
            code: 'REWARD_CARD_MISMATCH',
            message: 'La tarjeta no pertenece a la campaña de la recompensa',
          },
        });
      }

      if (reward.minTierId) {
        const [requiredTier] = (await db
          .select({ id: campaignTiers.id, name: campaignTiers.name, order: campaignTiers.order })
          .from(campaignTiers)
          .where(eq(campaignTiers.id, reward.minTierId))) as Array<{ id: string; name: string; order: number }>;
        const [currentTier] = card.currentTierId
          ? ((await db
              .select({ id: campaignTiers.id, order: campaignTiers.order })
              .from(campaignTiers)
              .where(eq(campaignTiers.id, card.currentTierId))) as Array<{ id: string; order: number }>)
          : [];

        if (!requiredTier || !currentTier || currentTier.order < requiredTier.order) {
          return status(422, {
            error: {
              code: 'REWARD_TIER_REQUIRED',
              message: requiredTier
                ? `Esta recompensa requiere nivel ${requiredTier.order}: ${requiredTier.name}`
                : 'Esta recompensa requiere un tier mínimo',
            },
          });
        }
      }

      let redemptionOutcome: {
        redemptionId: string;
        createdAt: Date;
        currentBalance: number;
        lifetimeBalance: number;
        rewardStock: number | null;
      } | null = null;

      try {
        redemptionOutcome = await db.transaction(async (tx) => {
          const [existingRedemption] = (await tx
            .select()
            .from(redemptions)
            .where(and(eq(redemptions.cardId, card.cardId), eq(redemptions.rewardId, reward.id)))) as Array<{
            id: string;
          }>;

          if (existingRedemption) {
            throwRedeemFailure('ALREADY_REDEEMED');
          }

          let rewardStock: number | null = reward.stock;
          if (reward.stock !== null) {
            const [stockRow] = await executeRows<{ stock: number }>(
              tx,
              sql`
                update rewards
                set stock = stock - 1, updated_at = ${new Date()}
                where id = ${reward.id} and stock > 0
                returning stock
              `,
            );

            if (!stockRow) {
              throwRedeemFailure('REWARD_OUT_OF_STOCK');
            }

            rewardStock = stockRow!.stock;
          }

          const [campaignBalance] = await executeRows<{ current: number; lifetime: number }>(
            tx,
            sql`
              update campaign_balances
              set current = current - ${reward.cost}, updated_at = ${new Date()}
              where card_id = ${card.cardId}
                and campaign_id = ${reward.campaignId}
                and current >= ${reward.cost}
              returning current, lifetime
            `,
          );

          if (!campaignBalance) {
            throwRedeemFailure('INSUFFICIENT_BALANCE');
          }
          const updatedCampaignBalance = campaignBalance!;

          await tx.execute(sql`
            update balances
            set current = greatest(0, current - ${reward.cost}), updated_at = ${new Date()}
            where card_id = ${card.cardId}
          `);

          const [created] = (await tx
            .insert(redemptions)
            .values({
              cardId: card.cardId,
              rewardId: reward.id,
              cost: reward.cost,
              status: 'completed',
              completedAt: new Date(),
            })
            .returning({ id: redemptions.id, createdAt: redemptions.createdAt })) as Array<{
            id: string;
            createdAt: Date;
          }>;

          if (!created) {
            throw new Error('REDEMPTION_CREATE_FAILED');
          }

          await evaluateCardTier({
            cardId: card.cardId,
            campaignId: reward.campaignId,
            database: tx,
          });

          return {
            redemptionId: created.id,
            createdAt: created.createdAt,
            currentBalance: updatedCampaignBalance.current,
            lifetimeBalance: updatedCampaignBalance.lifetime,
            rewardStock,
          };
        });
      } catch (error) {
        const redeemError = error as RedeemFailure;
        if (redeemError.redeemCode === 'ALREADY_REDEEMED' || isDuplicateKeyError(error)) {
          return status(409, {
            error: {
              code: 'ALREADY_REDEEMED',
              message: 'Esta recompensa ya ha sido canjeada',
            },
          });
        }

        if (redeemError.redeemCode === 'REWARD_OUT_OF_STOCK') {
          return status(422, {
            error: {
              code: 'REWARD_OUT_OF_STOCK',
              message: 'No hay stock disponible',
            },
          });
        }

        if (redeemError.redeemCode === 'INSUFFICIENT_BALANCE') {
          return status(422, {
            error: {
              code: 'INSUFFICIENT_BALANCE',
              message: 'Saldo insuficiente en la campaña para canjear recompensa',
            },
          });
        }

        throw error;
      }

      if (!redemptionOutcome) {
        return status(422, {
          error: {
            code: 'REDEMPTION_CREATE_FAILED',
            message: 'No se pudo canjear la recompensa',
          },
        });
      }

      return {
        data: {
          redemptionId: redemptionOutcome.redemptionId,
          reward: serializeReward({
            ...reward,
            stock: redemptionOutcome.rewardStock,
          }),
          card: {
            id: card.cardId,
            currentBalance: redemptionOutcome.currentBalance,
            lifetimeBalance: redemptionOutcome.lifetimeBalance,
          },
          redeemedAt: redemptionOutcome.createdAt.toISOString(),
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles] }),
      headers: authorizationHeader,
      body: rewardRedeemRequest,
      response: {
        200: redemptionResponse,
      },
      detail: {
        summary: 'Canjear recompensa',
      },
    },
  );
