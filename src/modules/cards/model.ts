import { t } from 'elysia';
import { paginationSchema } from '../common/model';
import { qrResponse } from '../stores/model';

export const cardSchema = t.Object({
  id: t.String(),
  userId: t.String(),
  campaignId: t.String(),
  storeId: t.Optional(t.String()),
  code: t.String(),
  currentTierId: t.Optional(t.String()),
  status: t.String(),
  createdAt: t.String(),
});

export const cardCreateRequest = t.Object({
  userId: t.String({ format: 'uuid' }),
  campaignId: t.String({ format: 'uuid' }),
  storeId: t.Optional(t.String({ format: 'uuid' })),
});

export const cardResponse = t.Object({
  data: cardSchema,
});

export const cardDetailResponse = t.Object({
  data: cardSchema,
});

export const cardListResponse = t.Object({
  data: t.Array(cardSchema),
  pagination: paginationSchema,
});

export const cardListQuery = t.Object({
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});

export { qrResponse };
