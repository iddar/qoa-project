import { pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

type TenantsTable = {
  slug: unknown;
};

export const tenants = pgTable(
  'tenants',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table: TenantsTable) => [uniqueIndex('tenants_slug_idx').on(table.slug)],
);
