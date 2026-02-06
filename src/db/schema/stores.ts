import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const storeStatus = pgEnum('store_status', ['active', 'inactive']);

export const stores = pgTable(
  'stores',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    type: varchar('type', { length: 100 }),
    address: text('address'),
    phone: varchar('phone', { length: 20 }),
    status: storeStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table): any => [uniqueIndex('stores_code_key').on(table.code)],
);
