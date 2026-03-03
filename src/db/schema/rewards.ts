import { index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { campaignTiers } from './campaign-tiers';
import { campaigns } from './campaigns';
import { cards } from './cards';

export const rewardStatus = pgEnum('reward_status', ['active', 'inactive']);
export const redemptionStatus = pgEnum('redemption_status', ['pending', 'completed', 'cancelled']);

type RewardsTable = {
  campaignId: unknown;
  status: unknown;
  createdAt: unknown;
};

type RedemptionsTable = {
  cardId: unknown;
  rewardId: unknown;
  status: unknown;
  createdAt: unknown;
};

export const rewards = pgTable(
  'rewards',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    cost: integer('cost').notNull(),
    minTierId: uuid('min_tier_id').references(() => campaignTiers.id, { onDelete: 'set null' }),
    stock: integer('stock'),
    status: rewardStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: RewardsTable) => [
    index('rewards_campaign_idx').on(table.campaignId),
    index('rewards_status_idx').on(table.status),
    index('rewards_created_at_idx').on(table.createdAt),
  ],
);

export const redemptions = pgTable(
  'redemptions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    rewardId: uuid('reward_id')
      .notNull()
      .references(() => rewards.id, { onDelete: 'cascade' }),
    cost: integer('cost').notNull(),
    status: redemptionStatus('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table: RedemptionsTable) => [
    index('redemptions_card_idx').on(table.cardId),
    index('redemptions_reward_idx').on(table.rewardId),
    index('redemptions_status_idx').on(table.status),
    index('redemptions_created_at_idx').on(table.createdAt),
  ],
);
