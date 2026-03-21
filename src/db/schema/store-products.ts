import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { stores } from './stores';
import { products } from './catalog';
import { cpgs } from './catalog';

export const storeProductUnitType = pgEnum('store_product_unit_type', ['piece']);
export const storeProductStatus = pgEnum('store_product_status', ['active', 'inactive']);

type StoreProductsTable = {
  storeId: unknown;
  productId: unknown;
  cpgId: unknown;
  sku: unknown;
};

export const storeProducts = pgTable(
  'store_products',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    cpgId: uuid('cpg_id').references(() => cpgs.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 200 }).notNull(),
    sku: varchar('sku', { length: 100 }),
    unitType: storeProductUnitType('unit_type').notNull().default('piece'),
    price: varchar('price', { length: 20 }).notNull(),
    status: storeProductStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: StoreProductsTable) => [
    index('store_products_store_idx').on(table.storeId),
    index('store_products_product_idx').on(table.productId),
    index('store_products_cpg_idx').on(table.cpgId),
    uniqueIndex('store_products_store_sku_key').on(table.storeId, table.sku),
  ],
);