import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userRole = pgEnum('user_role', ['consumer', 'store_staff', 'store_admin', 'cpg_admin', 'qoa_admin']);
export const userStatus = pgEnum('user_status', ['active', 'suspended']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v7()`),
    phone: varchar('phone', { length: 20 }).notNull(),
    email: varchar('email', { length: 255 }),
    name: varchar('name', { length: 100 }),
    passwordHash: varchar('password_hash', { length: 255 }),
    role: userRole('role').notNull().default('consumer'),
    status: userStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('users_phone_key').on(table.phone),
    uniqueIndex('users_email_key').on(table.email).where(sql`${table.email} is not null`),
  ],
);
