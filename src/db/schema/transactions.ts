import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cards } from './cards';
import { stores } from './stores';
import { users } from './users';

type TransactionsTable = {
  userId: unknown;
  storeId: unknown;
  cardId: unknown;
  idempotencyKey: unknown;
  createdAt: unknown;
};

type TransactionItemsTable = {
  transactionId: unknown;
};

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    cardId: uuid('card_id').references(() => cards.id, { onDelete: 'set null' }),
    idempotencyKey: text('idempotency_key'),
    totalAmount: integer('total_amount').notNull().default(0),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table: TransactionsTable) => [
    index('transactions_user_idx').on(table.userId),
    index('transactions_store_idx').on(table.storeId),
    index('transactions_card_idx').on(table.cardId),
    index('transactions_created_at_idx').on(table.createdAt),
    uniqueIndex('transactions_idempotency_key')
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
  ],
);

export const transactionItems = pgTable(
  'transaction_items',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    productId: text('product_id').notNull(),
    quantity: integer('quantity').notNull().default(1),
    amount: integer('amount').notNull().default(0),
    metadata: text('metadata'),
  },
  (table: TransactionItemsTable) => [index('transaction_items_transaction_idx').on(table.transactionId)],
);
