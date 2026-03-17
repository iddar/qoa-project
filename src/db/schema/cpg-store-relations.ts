import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cpgs } from './catalog';
import { stores } from './stores';
import { users } from './users';

export const cpgStoreRelationStatus = pgEnum('cpg_store_relation_status', ['active', 'inactive']);
export const cpgStoreRelationSource = pgEnum('cpg_store_relation_source', ['first_activity', 'manual', 'import']);

type CpgStoreRelationsTable = {
  cpgId: unknown;
  storeId: unknown;
  status: unknown;
  source: unknown;
  lastActivityAt: unknown;
};

export const cpgStoreRelations = pgTable(
  'cpg_store_relations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    cpgId: uuid('cpg_id')
      .notNull()
      .references(() => cpgs.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    status: cpgStoreRelationStatus('status').notNull().default('active'),
    source: cpgStoreRelationSource('source').notNull().default('first_activity'),
    firstActivityAt: timestamp('first_activity_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: CpgStoreRelationsTable) => [
    uniqueIndex('cpg_store_relations_cpg_store_key').on(table.cpgId, table.storeId),
    index('cpg_store_relations_cpg_idx').on(table.cpgId),
    index('cpg_store_relations_store_idx').on(table.storeId),
    index('cpg_store_relations_status_idx').on(table.status),
    index('cpg_store_relations_source_idx').on(table.source),
    index('cpg_store_relations_last_activity_idx').on(table.lastActivityAt),
  ],
);
