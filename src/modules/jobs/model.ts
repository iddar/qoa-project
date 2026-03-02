import { t } from 'elysia';
import { paginationSchema } from '../common/model';

export const reminderRunRequest = t.Object({
  limit: t.Optional(t.Number({ minimum: 1, maximum: 500 })),
});

export const reminderRunResponse = t.Object({
  data: t.Object({
    checked: t.Number(),
    queued: t.Number(),
    skipped: t.Number(),
    runAt: t.String(),
  }),
});

export const reminderJobSchema = t.Object({
  id: t.String(),
  cardId: t.String(),
  campaignId: t.String(),
  channel: t.String(),
  status: t.String(),
  scheduledFor: t.String(),
  createdAt: t.String(),
  processedAt: t.Optional(t.String()),
  error: t.Optional(t.String()),
});

export const reminderListQuery = t.Object({
  status: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});

export const reminderListResponse = t.Object({
  data: t.Array(reminderJobSchema),
  pagination: paginationSchema,
});

export const tierRunRequest = t.Object({
  limit: t.Optional(t.Number({ minimum: 1, maximum: 500 })),
});

export const tierRunResponse = t.Object({
  data: t.Object({
    checked: t.Number(),
    updated: t.Number(),
    atRisk: t.Number(),
    unchanged: t.Number(),
    runAt: t.String(),
  }),
});
