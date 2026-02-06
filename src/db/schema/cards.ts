import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { stores } from './stores';
import { users } from './users';

export const cardStatus = pgEnum('card_status', ['active', 'inactive']);

export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').notNull(),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
    code: varchar('code', { length: 32 }).notNull(),
    currentTierId: uuid('current_tier_id'),
    status: cardStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: any) => [
    uniqueIndex('cards_code_key').on(table.code),
    uniqueIndex('cards_user_campaign_key').on(table.userId, table.campaignId, table.storeId),
    index('cards_user_idx').on(table.userId),
    index('cards_campaign_idx').on(table.campaignId),
    index('cards_store_idx').on(table.storeId),
  ],
);
