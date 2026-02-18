import { index, integer, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cards } from './cards';
import { campaigns } from './campaigns';
import { transactionItems } from './transactions';

export const accumulationSourceType = pgEnum('accumulation_source_type', ['transaction_item', 'code_capture']);

type BalancesTable = {
  cardId: unknown;
};

type AccumulationsTable = {
  transactionItemId: unknown;
  cardId: unknown;
  campaignId: unknown;
  sourceType: unknown;
  createdAt: unknown;
};

export const balances = pgTable(
  'balances',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    current: integer('current').notNull().default(0),
    lifetime: integer('lifetime').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table: BalancesTable) => [uniqueIndex('balances_card_key').on(table.cardId)],
);

export const accumulations = pgTable(
  'accumulations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    transactionItemId: uuid('transaction_item_id').references(() => transactionItems.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    sourceType: accumulationSourceType('source_type').notNull(),
    codeCaptureId: uuid('code_capture_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table: AccumulationsTable) => [
    index('accumulations_tx_item_idx').on(table.transactionItemId),
    index('accumulations_card_idx').on(table.cardId),
    index('accumulations_campaign_idx').on(table.campaignId),
    index('accumulations_source_idx').on(table.sourceType),
    index('accumulations_created_at_idx').on(table.createdAt),
  ],
);
