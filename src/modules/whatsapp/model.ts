import { t } from 'elysia';
import { paginationSchema } from '../common/model';

export const whatsappWebhookRequest = t.Object({
  provider: t.Optional(t.String()),
  messageId: t.String(),
  from: t.String(),
  to: t.String(),
  text: t.Optional(t.String()),
  timestamp: t.Optional(t.String()),
  metadata: t.Optional(t.String()),
});

export const whatsappWebhookResponse = t.Object({
  data: t.Object({
    messageId: t.String(),
    status: t.String(),
    replayed: t.Boolean(),
  }),
});

export const whatsappMessageSchema = t.Object({
  id: t.String(),
  provider: t.String(),
  messageId: t.String(),
  from: t.String(),
  to: t.String(),
  text: t.Optional(t.String()),
  status: t.String(),
  replayCount: t.Number(),
  receivedAt: t.String(),
  processedAt: t.Optional(t.String()),
});

export const whatsappMessageListQuery = t.Object({
  status: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});

export const whatsappMessageListResponse = t.Object({
  data: t.Array(whatsappMessageSchema),
  pagination: paginationSchema,
});

export const whatsappMetricsResponse = t.Object({
  data: t.Object({
    totalReceived: t.Number(),
    processed: t.Number(),
    replayed: t.Number(),
    errors: t.Number(),
  }),
});
