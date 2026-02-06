import { index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const tenantType = pgEnum('tenant_type', ['cpg', 'store']);

type ApiKeysTable = {
  keyHash: unknown;
  tenantId: unknown;
  tenantType: unknown;
};

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    name: varchar('name', { length: 100 }).notNull(),
    keyHash: varchar('key_hash', { length: 255 }).notNull(),
    keyPrefix: varchar('key_prefix', { length: 20 }).notNull(),
    scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
    tenantId: uuid('tenant_id').notNull(),
    tenantType: tenantType('tenant_type').notNull(),
    rateLimit: integer('rate_limit').notNull().default(60),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table: ApiKeysTable) => [
    index('api_keys_key_hash_idx').on(table.keyHash),
    index('api_keys_tenant_idx').on(table.tenantId, table.tenantType),
  ],
);
