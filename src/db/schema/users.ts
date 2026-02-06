import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenantType } from './api-keys';

export const userRole = pgEnum('user_role', ['consumer', 'customer', 'store_staff', 'store_admin', 'cpg_admin', 'qoa_support', 'qoa_admin']);
export const userStatus = pgEnum('user_status', ['active', 'suspended']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    phone: varchar('phone', { length: 20 }).notNull(),
    email: varchar('email', { length: 255 }),
    name: varchar('name', { length: 100 }),
    passwordHash: varchar('password_hash', { length: 255 }),
    role: userRole('role').notNull().default('consumer'),
    status: userStatus('status').notNull().default('active'),
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    blockedUntil: timestamp('blocked_until', { withTimezone: true }),
    blockedReason: text('blocked_reason'),
    tenantId: uuid('tenant_id'),
    tenantType: tenantType('tenant_type'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: any) => [
    uniqueIndex('users_phone_key').on(table.phone),
    uniqueIndex('users_email_key').on(table.email).where(sql`${table.email} is not null`),
    index('users_tenant_idx').on(table.tenantId, table.tenantType),
  ],
);
