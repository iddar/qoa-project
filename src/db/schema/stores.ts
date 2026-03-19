import {
  index,
  decimal,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const storeStatus = pgEnum('store_status', ['active', 'inactive']);

type StoresTable = {
  code: unknown;
  latitude: unknown;
  longitude: unknown;
};

export const stores = pgTable(
  'stores',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    type: varchar('type', { length: 100 }),

    // Dirección legacy (texto libre)
    address: text('address'),
    phone: varchar('phone', { length: 20 }),

    // Dirección estructurada
    street: varchar('street', { length: 255 }),
    exteriorNumber: varchar('exterior_number', { length: 20 }),
    interiorNumber: varchar('interior_number', { length: 20 }),
    neighborhood: varchar('neighborhood', { length: 150 }),
    city: varchar('city', { length: 150 }),
    state: varchar('state', { length: 100 }),
    postalCode: varchar('postal_code', { length: 10 }),
    country: varchar('country', { length: 3 }).default('MEX'),

    // Georeferencia
    latitude: decimal('latitude', { precision: 10, scale: 7 }),
    longitude: decimal('longitude', { precision: 10, scale: 7 }),

    status: storeStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: StoresTable) => [
    uniqueIndex('stores_code_key').on(table.code),
    index('stores_lat_lng_idx').on(table.latitude, table.longitude),
  ],
);
