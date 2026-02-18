import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { campaigns } from './campaigns';
import { users } from './users';

export const campaignSubscriptionStatus = pgEnum('campaign_subscription_status', ['invited', 'subscribed', 'left']);

type CampaignSubscriptionsTable = {
  userId: unknown;
  campaignId: unknown;
  status: unknown;
  createdAt: unknown;
};

export const campaignSubscriptions = pgTable(
  'campaign_subscriptions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    status: campaignSubscriptionStatus('status').notNull().default('invited'),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    subscribedAt: timestamp('subscribed_at', { withTimezone: true }),
    leftAt: timestamp('left_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: CampaignSubscriptionsTable) => [
    uniqueIndex('campaign_subscriptions_user_campaign_key').on(table.userId, table.campaignId),
    index('campaign_subscriptions_user_idx').on(table.userId),
    index('campaign_subscriptions_campaign_idx').on(table.campaignId),
    index('campaign_subscriptions_status_idx').on(table.status),
    index('campaign_subscriptions_created_at_idx').on(table.createdAt),
  ],
);
