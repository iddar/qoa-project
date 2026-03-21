import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { campaigns } from './campaigns';
import { stores } from './stores';
import { users } from './users';

export const campaignStoreEnrollmentStatus = pgEnum('campaign_store_enrollment_status', [
  'visible',
  'invited',
  'enrolled',
  'declined',
  'removed',
  'suspended',
]);

export const campaignStoreVisibilitySource = pgEnum('campaign_store_visibility_source', [
  'manual',
  'zone',
  'import',
  'auto_related',
]);

export const campaignStoreEnrollmentSource = pgEnum('campaign_store_enrollment_source', [
  'cpg_managed',
  'store_opt_in',
  'auto_enroll',
]);

type CampaignStoreEnrollmentsTable = {
  campaignId: unknown;
  storeId: unknown;
  status: unknown;
  visibilitySource: unknown;
  enrollmentSource: unknown;
  updatedAt: unknown;
};

export const campaignStoreEnrollments = pgTable(
  'campaign_store_enrollments',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    status: campaignStoreEnrollmentStatus('status').notNull().default('visible'),
    visibilitySource: campaignStoreVisibilitySource('visibility_source').notNull().default('manual'),
    enrollmentSource: campaignStoreEnrollmentSource('enrollment_source'),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    enrolledByUserId: uuid('enrolled_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }),
    declinedAt: timestamp('declined_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: CampaignStoreEnrollmentsTable) => [
    uniqueIndex('campaign_store_enrollments_campaign_store_key').on(table.campaignId, table.storeId),
    index('campaign_store_enrollments_campaign_idx').on(table.campaignId),
    index('campaign_store_enrollments_store_idx').on(table.storeId),
    index('campaign_store_enrollments_status_idx').on(table.status),
    index('campaign_store_enrollments_visibility_source_idx').on(table.visibilitySource),
    index('campaign_store_enrollments_enrollment_source_idx').on(table.enrollmentSource),
    index('campaign_store_enrollments_updated_at_idx').on(table.updatedAt),
  ],
);
