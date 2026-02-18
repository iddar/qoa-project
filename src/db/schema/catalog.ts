import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const cpgStatus = pgEnum('cpg_status', ['active', 'inactive']);
export const brandStatus = pgEnum('brand_status', ['active', 'inactive']);
export const productStatus = pgEnum('product_status', ['active', 'inactive']);

type CpgsTable = {
  status: unknown;
};

type BrandsTable = {
  cpgId: unknown;
  name: unknown;
  status: unknown;
};

type ProductsTable = {
  brandId: unknown;
  sku: unknown;
  status: unknown;
};

export const cpgs = pgTable(
  'cpgs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    name: varchar('name', { length: 200 }).notNull(),
    status: cpgStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: CpgsTable) => [index('cpgs_status_idx').on(table.status)],
);

export const brands = pgTable(
  'brands',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    cpgId: uuid('cpg_id')
      .notNull()
      .references(() => cpgs.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    logoUrl: text('logo_url'),
    status: brandStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: BrandsTable) => [
    index('brands_cpg_idx').on(table.cpgId),
    index('brands_status_idx').on(table.status),
    uniqueIndex('brands_cpg_name_key').on(table.cpgId, table.name),
  ],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    sku: varchar('sku', { length: 50 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    status: productStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: ProductsTable) => [
    index('products_brand_idx').on(table.brandId),
    index('products_status_idx').on(table.status),
    uniqueIndex('products_sku_key').on(table.sku),
  ],
);
