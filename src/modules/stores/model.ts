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
  stock: t.Number(),
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

export const storeTransactionCustomerSchema = t.Object({
  userId: t.String(),
  cardId: t.String(),
  cardCode: t.String(),
  name: t.Optional(t.String()),
  phone: t.String(),
  email: t.Optional(t.String()),
});

export const storeTransactionAccumulationSchema = t.Object({
  cardId: t.String(),
  campaignId: t.String(),
  accumulated: t.Number(),
  newBalance: t.Number(),
  sourceType: t.String(),
  codeCaptureId: t.Optional(t.String()),
  codeValue: t.Optional(t.String()),
});

export const storeTransactionSchema = t.Object({
  id: t.String(),
  userId: t.Optional(t.String()),
  storeId: t.String(),
  cardId: t.Optional(t.String()),
  items: t.Array(storeTransactionItemSchema),
  totalAmount: t.Number(),
  guestFlag: t.Boolean(),
  customer: t.Optional(storeTransactionCustomerSchema),
  accumulations: t.Array(storeTransactionAccumulationSchema),
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

export const storeCustomerResolveRequest = t.Object({
  input: t.String({ minLength: 1 }),
});

export const storeCustomerResolveResponse = t.Object({
  data: storeTransactionCustomerSchema,
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

export const inventoryPreviewCandidateSchema = t.Object({
  storeProductId: t.String(),
  name: t.String(),
  sku: t.Optional(t.String()),
  price: t.Number(),
  stock: t.Number(),
  score: t.Number(),
});

export const inventoryPreviewRowSchema = t.Object({
  lineNumber: t.Number(),
  rawText: t.String(),
  name: t.String(),
  sku: t.Optional(t.String()),
  quantity: t.Number(),
  price: t.Optional(t.Number()),
  status: t.Union([
    t.Literal('matched'),
    t.Literal('new'),
    t.Literal('ambiguous'),
    t.Literal('invalid'),
  ]),
  matchedStoreProductId: t.Optional(t.String()),
  matchedProduct: t.Optional(storeProductSchema),
  candidates: t.Optional(t.Array(inventoryPreviewCandidateSchema)),
  errors: t.Optional(t.Array(t.String())),
});

export const inventoryPreviewSummarySchema = t.Object({
  totalRows: t.Number(),
  matchedRows: t.Number(),
  newRows: t.Number(),
  ambiguousRows: t.Number(),
  invalidRows: t.Number(),
  totalQuantity: t.Number(),
});

export const inventoryIntakePreviewRequest = t.Object({
  text: t.String({ minLength: 1 }),
});

export const inventoryIntakePreviewResponse = t.Object({
  data: t.Object({
    rows: t.Array(inventoryPreviewRowSchema),
    summary: inventoryPreviewSummarySchema,
  }),
});

export const inventoryIntakeConfirmRowSchema = t.Object({
  lineNumber: t.Number(),
  rawText: t.String(),
  name: t.String({ minLength: 1, maxLength: 200 }),
  sku: t.Optional(t.String({ maxLength: 100 })),
  quantity: t.Number({ minimum: 1 }),
  price: t.Optional(t.Number({ minimum: 0 })),
  action: t.Union([t.Literal('match_existing'), t.Literal('create_new')]),
  storeProductId: t.Optional(t.String({ format: 'uuid' })),
});

export const inventoryIntakeConfirmRequest = t.Object({
  rows: t.Array(inventoryIntakeConfirmRowSchema),
  idempotencyKey: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
  notes: t.Optional(t.String({ maxLength: 500 })),
});

export const inventoryIntakeAppliedRowSchema = t.Object({
  storeProductId: t.String(),
  name: t.String(),
  sku: t.Optional(t.String()),
  quantityDelta: t.Number(),
  previousStock: t.Number(),
  currentStock: t.Number(),
  created: t.Boolean(),
});

export const inventoryIntakeConfirmResponse = t.Object({
  data: t.Object({
    idempotencyKey: t.String(),
    replayed: t.Boolean(),
    rows: t.Array(inventoryIntakeAppliedRowSchema),
    summary: t.Object({
      totalRows: t.Number(),
      totalQuantity: t.Number(),
      createdProducts: t.Number(),
      updatedProducts: t.Number(),
    }),
  }),
});

export const inventoryMovementSchema = t.Object({
  id: t.String(),
  storeId: t.String(),
  storeProductId: t.String(),
  storeProductName: t.String(),
  sku: t.Optional(t.String()),
  type: t.Union([t.Literal('intake'), t.Literal('sale'), t.Literal('adjustment')]),
  quantityDelta: t.Number(),
  balanceAfter: t.Number(),
  referenceType: t.Optional(t.String()),
  referenceId: t.Optional(t.String()),
  notes: t.Optional(t.String()),
  createdAt: t.String(),
});

export const inventoryMovementListQuery = t.Object({
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
  storeProductId: t.Optional(t.String({ format: 'uuid' })),
  type: t.Optional(t.Union([t.Literal('intake'), t.Literal('sale'), t.Literal('adjustment')])),
});

export const inventoryMovementListResponse = t.Object({
  data: t.Array(inventoryMovementSchema),
  pagination: paginationSchema,
});
