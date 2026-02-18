import { t } from 'elysia';

export const alertSchema = t.Object({
  code: t.String(),
  source: t.String(),
  severity: t.Union([t.Literal('low'), t.Literal('medium'), t.Literal('high'), t.Literal('critical')]),
  title: t.String(),
  message: t.String(),
  count: t.Number(),
  updatedAt: t.String(),
});

export const alertListResponse = t.Object({
  data: t.Array(alertSchema),
});

export const alertNotifyRequest = t.Object({
  recipient: t.Optional(t.String()),
  minSeverity: t.Optional(t.Union([t.Literal('high'), t.Literal('critical')])),
});

export const alertNotifyResponse = t.Object({
  data: t.Object({
    sent: t.Number(),
    recipient: t.String(),
    severityFilter: t.String(),
    mocked: t.Boolean(),
  }),
});
