import { t } from 'elysia';
import { paginationSchema } from '../common/model';

export const transactionItemCreate = t.Object({
  productId: t.String(),
  quantity: t.Optional(t.Number({ minimum: 1 })),
  amount: t.Optional(t.Number()),
  metadata: t.Optional(t.String()),
});

export const transactionItemSchema = t.Object({
  productId: t.String(),
  quantity: t.Number(),
  amount: t.Number(),
  metadata: t.Optional(t.String()),
});

export const transactionSchema = t.Object({
  id: t.String(),
  userId: t.String(),
  storeId: t.String(),
  cardId: t.Optional(t.String()),
  items: t.Array(transactionItemSchema),
  totalAmount: t.Number(),
  createdAt: t.String(),
});

export const transactionWithAccumulations = t.Object({
  id: t.String(),
  userId: t.String(),
  storeId: t.String(),
  cardId: t.Optional(t.String()),
  items: t.Array(transactionItemSchema),
  totalAmount: t.Number(),
  createdAt: t.String(),
  accumulations: t.Array(
    t.Object({
      cardId: t.String(),
      campaignId: t.String(),
      accumulated: t.Number(),
      newBalance: t.Number(),
      sourceType: t.String(),
      codeCaptureId: t.Optional(t.String()),
      codeValue: t.Optional(t.String()),
    }),
  ),
});

export const transactionCreateRequest = t.Object({
  userId: t.String({ format: 'uuid' }),
  storeId: t.String({ format: 'uuid' }),
  cardId: t.Optional(t.String({ format: 'uuid' })),
  items: t.Array(transactionItemCreate),
  codes: t.Optional(t.Array(t.String())),
  metadata: t.Optional(t.String()),
  idempotencyKey: t.Optional(t.String()),
});

export const transactionWebhookRequest = t.Object({
  source: t.String(),
  externalEventId: t.Optional(t.String()),
  userId: t.String({ format: 'uuid' }),
  storeId: t.String({ format: 'uuid' }),
  cardId: t.Optional(t.String({ format: 'uuid' })),
  items: t.Array(transactionItemCreate),
  metadata: t.Optional(t.String()),
});

export const transactionListQuery = t.Object({
  userId: t.Optional(t.String({ format: 'uuid' })),
  storeId: t.Optional(t.String({ format: 'uuid' })),
  cardId: t.Optional(t.String({ format: 'uuid' })),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});

export const transactionResponse = t.Object({
  data: transactionWithAccumulations,
});

export const transactionDetailResponse = t.Object({
  data: transactionWithAccumulations,
});

export const transactionListResponse = t.Object({
  data: t.Array(transactionSchema),
  pagination: paginationSchema,
});

export const webhookReplayMeta = t.Object({
  replayed: t.Boolean(),
  hash: t.String(),
  externalEventId: t.Optional(t.String()),
});

export const transactionWebhookResponse = t.Object({
  data: transactionWithAccumulations,
  meta: webhookReplayMeta,
});
