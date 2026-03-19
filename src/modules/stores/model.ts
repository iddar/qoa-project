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

export const storeProductSchema = t.Object({
  id: t.String(),
  storeId: t.String(),
  productId: t.Optional(t.String()),
  cpgId: t.Optional(t.String()),
  name: t.String(),
  sku: t.Optional(t.String()),
  unitType: t.String(),
  price: t.Number(),
  status: t.String(),
  createdAt: t.String(),
});

export const storeProductCreateRequest = t.Object({
  name: t.String({ maxLength: 200 }),
  sku: t.Optional(t.String({ maxLength: 100 })),
  productId: t.Optional(t.String({ format: 'uuid' })),
  cpgId: t.Optional(t.String({ format: 'uuid' })),
  price: t.Number({ minimum: 0 }),
});

export const storeProductUpdateRequest = t.Object({
  name: t.Optional(t.String({ maxLength: 200 })),
  sku: t.Optional(t.String({ maxLength: 100 })),
  cpgId: t.Optional(t.String({ format: 'uuid' })),
  price: t.Optional(t.Number({ minimum: 0 })),
  status: t.Optional(t.Union([t.Literal('active'), t.Literal('inactive')])),
});

export const storeProductListQuery = t.Object({
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
  status: t.Optional(t.Union([t.Literal('active'), t.Literal('inactive')])),
  search: t.Optional(t.String()),
});

export const storeProductResponse = t.Object({
  data: storeProductSchema,
});

export const storeProductListResponse = t.Object({
  data: t.Array(storeProductSchema),
  pagination: paginationSchema,
});

export const storeTransactionCreateRequest = t.Object({
  userId: t.Optional(t.String({ format: 'uuid' })),
  cardId: t.Optional(t.String({ format: 'uuid' })),
  items: t.Array(
    t.Object({
      storeProductId: t.String({ format: 'uuid' }),
      quantity: t.Number({ minimum: 1 }),
      amount: t.Number({ minimum: 0 }),
    }),
  ),
  idempotencyKey: t.Optional(t.String()),
});

export const storeTransactionItemSchema = t.Object({
  id: t.String(),
  storeProductId: t.String(),
  productId: t.Optional(t.String()),
  name: t.String(),
  quantity: t.Number(),
  amount: t.Number(),
});

export const storeTransactionSchema = t.Object({
  id: t.String(),
  userId: t.Optional(t.String()),
  storeId: t.String(),
  cardId: t.Optional(t.String()),
  items: t.Array(storeTransactionItemSchema),
  totalAmount: t.Number(),
  guestFlag: t.Boolean(),
  createdAt: t.String(),
});

export const storeTransactionResponse = t.Object({
  data: storeTransactionSchema,
});

export const storeTransactionListQuery = t.Object({
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
});

export const storeTransactionListResponse = t.Object({
  data: t.Array(storeTransactionSchema),
  pagination: paginationSchema,
});

export const storeProductSearchQuery = t.Object({
  q: t.String(),
  limit: t.Optional(t.String()),
});

export const storeBrandSchema = t.Object({
  id: t.String(),
  cpgId: t.String(),
  name: t.String(),
  logoUrl: t.Optional(t.String()),
  status: t.String(),
});

export const storeBrandListResponse = t.Object({
  data: t.Array(storeBrandSchema),
});

export const storeBrandWithProductsSchema = t.Object({
  id: t.String(),
  cpgId: t.String(),
  name: t.String(),
  logoUrl: t.Optional(t.String()),
  products: t.Array(t.Object({
    id: t.String(),
    name: t.String(),
    sku: t.Optional(t.String()),
    price: t.String(),
  })),
});
