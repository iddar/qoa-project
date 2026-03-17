import { t } from 'elysia';
import { paginationSchema } from '../common/model';

export const storeSchema = t.Object({
  id: t.String(),
  code: t.String(),
  name: t.String(),
  type: t.Optional(t.String()),
  address: t.Optional(t.String()),
  phone: t.Optional(t.String()),
  street: t.Optional(t.String()),
  exteriorNumber: t.Optional(t.String()),
  interiorNumber: t.Optional(t.String()),
  neighborhood: t.Optional(t.String()),
  city: t.Optional(t.String()),
  state: t.Optional(t.String()),
  postalCode: t.Optional(t.String()),
  country: t.Optional(t.String()),
  latitude: t.Optional(t.Number()),
  longitude: t.Optional(t.Number()),
  status: t.String(),
  createdAt: t.String(),
});

export const storeCreateRequest = t.Object({
  name: t.String({ maxLength: 200 }),
  type: t.Optional(t.String()),
  address: t.Optional(t.String()),
  phone: t.Optional(t.String()),
  street: t.Optional(t.String({ maxLength: 255 })),
  exteriorNumber: t.Optional(t.String({ maxLength: 20 })),
  interiorNumber: t.Optional(t.String({ maxLength: 20 })),
  neighborhood: t.Optional(t.String({ maxLength: 150 })),
  city: t.Optional(t.String({ maxLength: 150 })),
  state: t.Optional(t.String({ maxLength: 100 })),
  postalCode: t.Optional(t.String({ maxLength: 10 })),
  country: t.Optional(t.String({ maxLength: 3 })),
  latitude: t.Optional(t.Number()),
  longitude: t.Optional(t.Number()),
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
