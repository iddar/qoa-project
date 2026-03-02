import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { campaigns } from './campaigns';

export const tierWindowUnit = pgEnum('tier_window_unit', ['day', 'month', 'year']);
export const tierQualificationMode = pgEnum('tier_qualification_mode', ['any', 'all']);
export const tierBenefitType = pgEnum('tier_benefit_type', ['discount', 'reward', 'multiplier', 'free_product']);

type CampaignTiersTable = {
  campaignId: unknown;
  order: unknown;
  thresholdValue: unknown;
};

type TierBenefitsTable = {
  tierId: unknown;
  type: unknown;
};

export const campaignTiers = pgTable(
  'campaign_tiers',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    order: integer('order').notNull(),
    thresholdValue: integer('threshold_value').notNull(),
    windowUnit: tierWindowUnit('window_unit').notNull().default('day'),
    windowValue: integer('window_value').notNull().default(90),
    minPurchaseCount: integer('min_purchase_count'),
    minPurchaseAmount: integer('min_purchase_amount'),
    qualificationMode: tierQualificationMode('qualification_mode').notNull().default('any'),
    graceDays: integer('grace_days').notNull().default(7),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: CampaignTiersTable) => [
    uniqueIndex('campaign_tiers_campaign_order_key').on(table.campaignId, table.order),
    index('campaign_tiers_campaign_idx').on(table.campaignId),
    index('campaign_tiers_threshold_idx').on(table.thresholdValue),
  ],
);

export const tierBenefits = pgTable(
  'tier_benefits',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    tierId: uuid('tier_id')
      .notNull()
      .references(() => campaignTiers.id, { onDelete: 'cascade' }),
    type: tierBenefitType('type').notNull(),
    config: text('config'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: TierBenefitsTable) => [
    index('tier_benefits_tier_idx').on(table.tierId),
    index('tier_benefits_type_idx').on(table.type),
  ],
);
