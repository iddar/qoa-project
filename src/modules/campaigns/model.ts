import { t } from 'elysia';
import { paginationSchema } from '../common/model';

export const campaignStatusSchema = t.Union([
  t.Literal('draft'),
  t.Literal('ready_for_review'),
  t.Literal('in_review'),
  t.Literal('rejected'),
  t.Literal('confirmed'),
  t.Literal('active'),
  t.Literal('paused'),
  t.Literal('ended'),
]);

export const campaignSchema = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.Optional(t.String()),
  cpgId: t.Optional(t.String()),
  status: campaignStatusSchema,
  startsAt: t.Optional(t.String()),
  endsAt: t.Optional(t.String()),
  version: t.Number(),
  createdBy: t.Optional(t.String()),
  updatedBy: t.Optional(t.String()),
  createdAt: t.String(),
  updatedAt: t.Optional(t.String()),
});

export const campaignAuditLogSchema = t.Object({
  id: t.String(),
  campaignId: t.String(),
  action: t.String(),
  notes: t.Optional(t.String()),
  actorUserId: t.Optional(t.String()),
  metadata: t.Optional(t.String()),
  createdAt: t.String(),
});

export const campaignCreateRequest = t.Object({
  name: t.String({ minLength: 3, maxLength: 160 }),
  description: t.Optional(t.String()),
  cpgId: t.Optional(t.String({ format: 'uuid' })),
  startsAt: t.Optional(t.String()),
  endsAt: t.Optional(t.String()),
});

export const campaignUpdateRequest = t.Object({
  name: t.Optional(t.String({ minLength: 3, maxLength: 160 })),
  description: t.Optional(t.String()),
  startsAt: t.Optional(t.String()),
  endsAt: t.Optional(t.String()),
  status: t.Optional(campaignStatusSchema),
});

export const campaignListQuery = t.Object({
  status: t.Optional(campaignStatusSchema),
  cpgId: t.Optional(t.String({ format: 'uuid' })),
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});

export const campaignAuditQuery = t.Object({
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});

export const campaignReviewRequest = t.Object({
  approved: t.Optional(t.Boolean()),
  notes: t.Optional(t.String()),
});

export const campaignNoteRequest = t.Object({
  notes: t.Optional(t.String()),
  reason: t.Optional(t.String()),
});

export const campaignResponse = t.Object({
  data: campaignSchema,
});

export const campaignListResponse = t.Object({
  data: t.Array(campaignSchema),
  pagination: paginationSchema,
});

export const campaignAuditListResponse = t.Object({
  data: t.Array(campaignAuditLogSchema),
  pagination: paginationSchema,
});
