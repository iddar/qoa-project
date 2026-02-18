import { t } from 'elysia';
import { paginationSchema } from '../common/model';

const entityStatus = t.Union([t.Literal('active'), t.Literal('inactive')]);

export const cpgSchema = t.Object({
  id: t.String(),
  name: t.String(),
  status: entityStatus,
  createdAt: t.String(),
});

export const cpgCreateRequest = t.Object({
  name: t.String({ minLength: 2, maxLength: 200 }),
  status: t.Optional(entityStatus),
});

export const cpgListQuery = t.Object({
  status: t.Optional(entityStatus),
  q: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});

export const cpgResponse = t.Object({
  data: cpgSchema,
});

export const cpgListResponse = t.Object({
  data: t.Array(cpgSchema),
  pagination: paginationSchema,
});

export const brandSchema = t.Object({
  id: t.String(),
  cpgId: t.String(),
  name: t.String(),
  logoUrl: t.Optional(t.String()),
  status: entityStatus,
  createdAt: t.String(),
});

export const brandCreateRequest = t.Object({
  cpgId: t.String({ format: 'uuid' }),
  name: t.String({ minLength: 2, maxLength: 200 }),
  logoUrl: t.Optional(t.String()),
  status: t.Optional(entityStatus),
});

export const brandListQuery = t.Object({
  cpgId: t.Optional(t.String({ format: 'uuid' })),
  status: t.Optional(entityStatus),
  q: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});

export const brandResponse = t.Object({
  data: brandSchema,
});

export const brandListResponse = t.Object({
  data: t.Array(brandSchema),
  pagination: paginationSchema,
});

export const productSchema = t.Object({
  id: t.String(),
  brandId: t.String(),
  sku: t.String(),
  name: t.String(),
  status: entityStatus,
  createdAt: t.String(),
});

export const productCreateRequest = t.Object({
  brandId: t.String({ format: 'uuid' }),
  sku: t.String({ minLength: 2, maxLength: 50 }),
  name: t.String({ minLength: 2, maxLength: 200 }),
  status: t.Optional(entityStatus),
});

export const productListQuery = t.Object({
  cpgId: t.Optional(t.String({ format: 'uuid' })),
  brandId: t.Optional(t.String({ format: 'uuid' })),
  status: t.Optional(entityStatus),
  q: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});

export const productResponse = t.Object({
  data: productSchema,
});

export const productListResponse = t.Object({
  data: t.Array(productSchema),
  pagination: paginationSchema,
});
