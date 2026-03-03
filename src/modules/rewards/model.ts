import { t } from 'elysia';
import { paginationSchema } from '../common/model';

export const rewardStatusSchema = t.Union([t.Literal('active'), t.Literal('inactive')]);

export const rewardSchema = t.Object({
  id: t.String(),
  campaignId: t.String(),
  name: t.String(),
  description: t.Optional(t.String()),
  imageUrl: t.Optional(t.String()),
  cost: t.Number(),
  minTierId: t.Optional(t.String()),
  stock: t.Optional(t.Number()),
  status: rewardStatusSchema,
  createdAt: t.String(),
  updatedAt: t.Optional(t.String()),
});

export const rewardCreateRequest = t.Object({
  campaignId: t.String({ format: 'uuid' }),
  name: t.String({ minLength: 3, maxLength: 200 }),
  description: t.Optional(t.String()),
  imageUrl: t.Optional(t.String()),
  cost: t.Number({ minimum: 1 }),
  minTierId: t.Optional(t.String({ format: 'uuid' })),
  stock: t.Optional(t.Number({ minimum: 0 })),
  status: t.Optional(rewardStatusSchema),
});

export const rewardListQuery = t.Object({
  campaignId: t.Optional(t.String({ format: 'uuid' })),
  available: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});

export const rewardResponse = t.Object({
  data: rewardSchema,
});

export const rewardListResponse = t.Object({
  data: t.Array(rewardSchema),
  pagination: paginationSchema,
});

export const rewardRedeemRequest = t.Object({
  cardId: t.String({ format: 'uuid' }),
});

export const redemptionResponse = t.Object({
  data: t.Object({
    redemptionId: t.String(),
    reward: rewardSchema,
    card: t.Object({
      id: t.String(),
      currentBalance: t.Number(),
      lifetimeBalance: t.Number(),
    }),
    redeemedAt: t.String(),
  }),
});
