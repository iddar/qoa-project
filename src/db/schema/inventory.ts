import { index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { stores } from './stores';
import { storeProducts } from './store-products';

export const inventoryMovementType = pgEnum('inventory_movement_type', ['intake', 'sale', 'adjustment']);

type InventoryMovementsTable = {
  storeId: unknown;
  storeProductId: unknown;
  referenceType: unknown;
  referenceId: unknown;
  createdAt: unknown;
};

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    storeProductId: uuid('store_product_id')
      .notNull()
      .references(() => storeProducts.id, { onDelete: 'cascade' }),
    type: inventoryMovementType('type').notNull(),
    quantityDelta: integer('quantity_delta').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    referenceType: varchar('reference_type', { length: 50 }),
    referenceId: varchar('reference_id', { length: 120 }),
    notes: text('notes'),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table: InventoryMovementsTable) => [
    index('inventory_movements_store_idx').on(table.storeId),
    index('inventory_movements_store_product_idx').on(table.storeProductId),
    index('inventory_movements_reference_idx').on(table.referenceType, table.referenceId),
    index('inventory_movements_created_at_idx').on(table.createdAt),
  ],
);
