import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm/sql';
import { authGuard, authPlugin } from '../../app/plugins/auth';
import { parseCursor, parseLimit } from '../../app/utils/pagination';
import { db } from '../../db/client';
import { brands, cpgs, products } from '../../db/schema';
import type { StatusHandler } from '../../types/handlers';
import {
  brandCreateRequest,
  brandListQuery,
  brandListResponse,
  brandResponse,
  cpgCreateRequest,
  cpgListQuery,
  cpgListResponse,
  cpgResponse,
  productCreateRequest,
  productListQuery,
  productListResponse,
  productResponse,
} from './model';

type CpgRow = {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
};

type BrandRow = {
  id: string;
  cpgId: string;
  name: string;
  logoUrl: string | null;
  status: string;
  createdAt: Date;
};

type ProductRow = {
  id: string;
  brandId: string;
  sku: string;
  name: string;
  status: string;
  createdAt: Date;
};

type CpgListRow = {
  id: string;
  name: string;
  status: string;
  created_at: Date | string;
};

type BrandListRow = {
  id: string;
  cpg_id: string;
  name: string;
  logo_url: string | null;
  status: string;
  created_at: Date | string;
};

type ProductListRow = {
  id: string;
  brand_id: string;
  sku: string;
  name: string;
  status: string;
  created_at: Date | string;
};

type PaginationQuery = {
  limit?: string;
  cursor?: string;
};

type CpgListContext = {
  query: PaginationQuery & { status?: string; q?: string };
  status: StatusHandler;
};

type BrandListContext = {
  query: PaginationQuery & { cpgId?: string; status?: string; q?: string };
  status: StatusHandler;
};

type ProductListContext = {
  query: PaginationQuery & { cpgId?: string; brandId?: string; status?: string; q?: string };
  status: StatusHandler;
};

type CpgCreateContext = {
  body: { name: string; status?: 'active' | 'inactive' };
  status: StatusHandler;
};

type BrandCreateContext = {
  body: { cpgId: string; name: string; logoUrl?: string; status?: 'active' | 'inactive' };
  status: StatusHandler;
};

type ProductCreateContext = {
  body: { brandId: string; sku: string; name: string; status?: 'active' | 'inactive' };
  status: StatusHandler;
};

type IdParamsContext = {
  params: { id: string };
  status: StatusHandler;
};

const asDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));

const serializeCpg = (row: CpgRow) => ({
  id: row.id,
  name: row.name,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
});

const serializeBrand = (row: BrandRow) => ({
  id: row.id,
  cpgId: row.cpgId,
  name: row.name,
  logoUrl: row.logoUrl ?? undefined,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
});

const serializeProduct = (row: ProductRow) => ({
  id: row.id,
  brandId: row.brandId,
  sku: row.sku,
  name: row.name,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
});

export const catalogModule = new Elysia({
  detail: {
    tags: ['Catalog'],
  },
})
  .use(authPlugin)
  .get(
    '/cpgs',
    async ({ query, status }: CpgListContext) => {
      const cursorDate = parseCursor(query.cursor);
      if (query.cursor && !cursorDate) {
        return status(400, {
          error: {
            code: 'INVALID_CURSOR',
            message: 'Cursor inválido',
          },
        });
      }

      const limit = parseLimit(query.limit);
      const safeLimit = Math.trunc(limit) + 1;
      const filters = [sql`1 = 1`];
      if (query.status) {
        filters.push(sql`"status" = ${query.status}`);
      }
      if (query.q) {
        filters.push(sql`"name" ilike ${`%${query.q}%`}`);
      }
      if (cursorDate) {
        filters.push(sql`"created_at" < ${cursorDate}`);
      }

      const listQuery = sql`
        select "id", "name", "status", "created_at"
        from "cpgs"
        where ${sql.join(filters, sql` and `)}
        order by "created_at" desc, "id" desc
        limit ${sql.raw(String(safeLimit))}
      `;
      const raw = (await db.execute(listQuery)) as CpgListRow[];
      const rows = raw.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        createdAt: asDate(item.created_at),
      }));

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : null;

      return {
        data: items.map(serializeCpg),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      beforeHandle: authGuard({ allowApiKey: true }),
      query: cpgListQuery,
      response: {
        200: cpgListResponse,
      },
      detail: {
        tags: ['CPGs'],
        summary: 'Listar CPGs',
      },
    },
  )
  .post(
    '/cpgs',
    async ({ body, status }: CpgCreateContext) => {
      const [created] = (await db
        .insert(cpgs)
        .values({
          name: body.name,
          status: body.status ?? 'active',
        })
        .returning()) as CpgRow[];

      if (!created) {
        return status(500, {
          error: {
            code: 'CPG_CREATE_FAILED',
            message: 'No se pudo crear el CPG',
          },
        });
      }

      return status(201, {
        data: serializeCpg(created),
      });
    },
    {
      beforeHandle: authGuard({ allowApiKey: true }),
      body: cpgCreateRequest,
      response: {
        201: cpgResponse,
      },
      detail: {
        tags: ['CPGs'],
        summary: 'Crear CPG',
      },
    },
  )
  .get(
    '/cpgs/:id',
    async ({ params, status }: IdParamsContext) => {
      const [record] = (await db.select().from(cpgs).where(eq(cpgs.id, params.id))) as CpgRow[];
      if (!record) {
        return status(404, {
          error: {
            code: 'CPG_NOT_FOUND',
            message: 'CPG no encontrado',
          },
        });
      }

      return {
        data: serializeCpg(record),
      };
    },
    {
      beforeHandle: authGuard({ allowApiKey: true }),
      response: {
        200: cpgResponse,
      },
      detail: {
        tags: ['CPGs'],
        summary: 'Obtener CPG',
      },
    },
  )
  .get(
    '/brands',
    async ({ query, status }: BrandListContext) => {
      const cursorDate = parseCursor(query.cursor);
      if (query.cursor && !cursorDate) {
        return status(400, {
          error: {
            code: 'INVALID_CURSOR',
            message: 'Cursor inválido',
          },
        });
      }

      const limit = parseLimit(query.limit);
      const safeLimit = Math.trunc(limit) + 1;
      const filters = [sql`1 = 1`];
      if (query.cpgId) {
        filters.push(sql`"cpg_id" = ${query.cpgId}`);
      }
      if (query.status) {
        filters.push(sql`"status" = ${query.status}`);
      }
      if (query.q) {
        filters.push(sql`"name" ilike ${`%${query.q}%`}`);
      }
      if (cursorDate) {
        filters.push(sql`"created_at" < ${cursorDate}`);
      }

      const listQuery = sql`
        select "id", "cpg_id", "name", "logo_url", "status", "created_at"
        from "brands"
        where ${sql.join(filters, sql` and `)}
        order by "created_at" desc, "id" desc
        limit ${sql.raw(String(safeLimit))}
      `;
      const raw = (await db.execute(listQuery)) as BrandListRow[];
      const rows = raw.map((item) => ({
        id: item.id,
        cpgId: item.cpg_id,
        name: item.name,
        logoUrl: item.logo_url,
        status: item.status,
        createdAt: asDate(item.created_at),
      }));

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : null;

      return {
        data: items.map(serializeBrand),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      beforeHandle: authGuard({ allowApiKey: true }),
      query: brandListQuery,
      response: {
        200: brandListResponse,
      },
      detail: {
        tags: ['Brands'],
        summary: 'Listar marcas',
      },
    },
  )
  .post(
    '/brands',
    async ({ body, status }: BrandCreateContext) => {
      const [cpg] = (await db.select({ id: cpgs.id }).from(cpgs).where(eq(cpgs.id, body.cpgId))) as Array<{
        id: string;
      }>;
      if (!cpg) {
        return status(404, {
          error: {
            code: 'CPG_NOT_FOUND',
            message: 'CPG no encontrado',
          },
        });
      }

      const [created] = (await db
        .insert(brands)
        .values({
          cpgId: body.cpgId,
          name: body.name,
          logoUrl: body.logoUrl ?? null,
          status: body.status ?? 'active',
        })
        .returning()) as BrandRow[];

      if (!created) {
        return status(500, {
          error: {
            code: 'BRAND_CREATE_FAILED',
            message: 'No se pudo crear la marca',
          },
        });
      }

      return status(201, {
        data: serializeBrand(created),
      });
    },
    {
      beforeHandle: authGuard({ allowApiKey: true }),
      body: brandCreateRequest,
      response: {
        201: brandResponse,
      },
      detail: {
        tags: ['Brands'],
        summary: 'Crear marca',
      },
    },
  )
  .get(
    '/brands/:id',
    async ({ params, status }: IdParamsContext) => {
      const [record] = (await db.select().from(brands).where(eq(brands.id, params.id))) as BrandRow[];
      if (!record) {
        return status(404, {
          error: {
            code: 'BRAND_NOT_FOUND',
            message: 'Marca no encontrada',
          },
        });
      }

      return {
        data: serializeBrand(record),
      };
    },
    {
      beforeHandle: authGuard({ allowApiKey: true }),
      response: {
        200: brandResponse,
      },
      detail: {
        tags: ['Brands'],
        summary: 'Obtener marca',
      },
    },
  )
  .get(
    '/products',
    async ({ query, status }: ProductListContext) => {
      const cursorDate = parseCursor(query.cursor);
      if (query.cursor && !cursorDate) {
        return status(400, {
          error: {
            code: 'INVALID_CURSOR',
            message: 'Cursor inválido',
          },
        });
      }

      const limit = parseLimit(query.limit);
      const safeLimit = Math.trunc(limit) + 1;
      const filters = [sql`1 = 1`];
      if (query.brandId) {
        filters.push(sql`"products"."brand_id" = ${query.brandId}`);
      }
      if (query.status) {
        filters.push(sql`"products"."status" = ${query.status}`);
      }
      if (query.q) {
        filters.push(sql`("products"."name" ilike ${`%${query.q}%`} or "products"."sku" ilike ${`%${query.q}%`})`);
      }
      if (query.cpgId) {
        filters.push(sql`"brands"."cpg_id" = ${query.cpgId}`);
      }
      if (cursorDate) {
        filters.push(sql`"products"."created_at" < ${cursorDate}`);
      }

      const listQuery = sql`
        select "products"."id", "products"."brand_id", "products"."sku", "products"."name", "products"."status", "products"."created_at"
        from "products"
        inner join "brands" on "brands"."id" = "products"."brand_id"
        where ${sql.join(filters, sql` and `)}
        order by "products"."created_at" desc, "products"."id" desc
        limit ${sql.raw(String(safeLimit))}
      `;
      const raw = (await db.execute(listQuery)) as ProductListRow[];
      const rows = raw.map((item) => ({
        id: item.id,
        brandId: item.brand_id,
        sku: item.sku,
        name: item.name,
        status: item.status,
        createdAt: asDate(item.created_at),
      }));

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : null;

      return {
        data: items.map(serializeProduct),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      beforeHandle: authGuard({ allowApiKey: true }),
      query: productListQuery,
      response: {
        200: productListResponse,
      },
      detail: {
        tags: ['Products'],
        summary: 'Listar productos',
      },
    },
  )
  .post(
    '/products',
    async ({ body, status }: ProductCreateContext) => {
      const [brand] = (await db.select({ id: brands.id }).from(brands).where(eq(brands.id, body.brandId))) as Array<{
        id: string;
      }>;
      if (!brand) {
        return status(404, {
          error: {
            code: 'BRAND_NOT_FOUND',
            message: 'Marca no encontrada',
          },
        });
      }

      const [created] = (await db
        .insert(products)
        .values({
          brandId: body.brandId,
          sku: body.sku,
          name: body.name,
          status: body.status ?? 'active',
        })
        .returning()) as ProductRow[];

      if (!created) {
        return status(500, {
          error: {
            code: 'PRODUCT_CREATE_FAILED',
            message: 'No se pudo crear el producto',
          },
        });
      }

      return status(201, {
        data: serializeProduct(created),
      });
    },
    {
      beforeHandle: authGuard({ allowApiKey: true }),
      body: productCreateRequest,
      response: {
        201: productResponse,
      },
      detail: {
        tags: ['Products'],
        summary: 'Crear producto',
      },
    },
  )
  .get(
    '/products/:id',
    async ({ params, status }: IdParamsContext) => {
      const [record] = (await db.select().from(products).where(eq(products.id, params.id))) as ProductRow[];
      if (!record) {
        return status(404, {
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: 'Producto no encontrado',
          },
        });
      }

      return {
        data: serializeProduct(record),
      };
    },
    {
      beforeHandle: authGuard({ allowApiKey: true }),
      response: {
        200: productResponse,
      },
      detail: {
        tags: ['Products'],
        summary: 'Obtener producto',
      },
    },
  );
