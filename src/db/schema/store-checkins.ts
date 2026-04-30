import { index, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { stores } from './stores';
import { transactions } from './transactions';
import { users } from './users';

export const storeCheckinStatus = pgEnum('store_checkin_status', ['pending', 'matched', 'expired']);

export const storeCheckins = pgTable(
  'store_checkins',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    status: storeCheckinStatus('status').notNull().default('pending'),
    matchedTransactionId: uuid('matched_transaction_id').references(() => transactions.id, {
      onDelete: 'set null',
    }),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }).notNull().defaultNow(),
    matchedAt: timestamp('matched_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table) => [
    index('store_checkins_user_idx').on(table.userId),
    index('store_checkins_store_idx').on(table.storeId),
    index('store_checkins_status_idx').on(table.status),
    index('store_checkins_expires_idx').on(table.expiresAt),
    index('store_checkins_checked_in_idx').on(table.checkedInAt),
    index('store_checkins_matched_tx_idx').on(table.matchedTransactionId),
    index('store_checkins_store_status_expires_checked_idx').on(
      table.storeId,
      table.status,
      table.expiresAt,
      table.checkedInAt,
    ),
    index('store_checkins_user_store_status_expires_checked_idx').on(
      table.userId,
      table.storeId,
      table.status,
      table.expiresAt,
      table.checkedInAt,
    ),
  ],
);
