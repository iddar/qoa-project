import { t } from 'elysia';

const paginationSchema = t.Object({
  hasMore: t.Boolean(),
  nextCursor: t.Optional(t.String()),
});

export const storeSchema = t.Object({
  id: t.String(),
  code: t.String(),
  name: t.String(),
  type: t.Optional(t.String()),
  address: t.Optional(t.String()),
  phone: t.Optional(t.String()),
  status: t.String(),
  createdAt: t.String(),
});

export const storeCreateRequest = t.Object({
  name: t.String({ maxLength: 200 }),
  type: t.Optional(t.String()),
  address: t.Optional(t.String()),
  phone: t.Optional(t.String()),
});

export const storeListQuery = t.Object({
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});

export const storeResponse = t.Object({
  data: storeSchema,
});

export const storeListResponse = t.Object({
  data: t.Array(storeSchema),
  pagination: paginationSchema,
});

export const qrPayloadSchema = t.Object({
  entityType: t.Union([t.Literal('store'), t.Literal('card')]),
  entityId: t.String(),
  code: t.String(),
});

export const qrResponse = t.Object({
  data: t.Object({
    code: t.String(),
    payload: qrPayloadSchema,
    expiresAt: t.Optional(t.String()),
  }),
});
