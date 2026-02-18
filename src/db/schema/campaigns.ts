import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { brands, products } from './catalog';
import { users } from './users';

export const campaignStatus = pgEnum('campaign_status', [
  'draft',
  'ready_for_review',
  'in_review',
  'rejected',
  'confirmed',
  'active',
  'paused',
  'ended',
]);

export const campaignPolicyType = pgEnum('campaign_policy_type', [
  'max_accumulations',
  'min_amount',
  'min_quantity',
  'cooldown',
]);

export const campaignPolicyScopeType = pgEnum('campaign_policy_scope_type', ['campaign', 'brand', 'product']);

export const campaignPolicyPeriod = pgEnum('campaign_policy_period', [
  'transaction',
  'day',
  'week',
  'month',
  'lifetime',
]);

type CampaignsTable = {
  cpgId: unknown;
  status: unknown;
  createdAt: unknown;
};

type CampaignAuditLogsTable = {
  campaignId: unknown;
  createdAt: unknown;
};

type CampaignPoliciesTable = {
  campaignId: unknown;
  policyType: unknown;
  scopeType: unknown;
  active: unknown;
  createdAt: unknown;
};

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    cpgId: uuid('cpg_id'),
    status: campaignStatus('status').notNull().default('draft'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: CampaignsTable) => [
    index('campaigns_cpg_idx').on(table.cpgId),
    index('campaigns_status_idx').on(table.status),
    index('campaigns_created_at_idx').on(table.createdAt),
  ],
);

export const campaignAuditLogs = pgTable(
  'campaign_audit_logs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 60 }).notNull(),
    notes: text('notes'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table: CampaignAuditLogsTable) => [
    index('campaign_audit_logs_campaign_idx').on(table.campaignId),
    index('campaign_audit_logs_created_at_idx').on(table.createdAt),
  ],
);

export const campaignPolicies = pgTable(
  'campaign_policies',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    policyType: campaignPolicyType('policy_type').notNull(),
    scopeType: campaignPolicyScopeType('scope_type').notNull(),
    scopeId: uuid('scope_id'),
    scopeBrandId: uuid('scope_brand_id').references(() => brands.id, { onDelete: 'set null' }),
    scopeProductId: uuid('scope_product_id').references(() => products.id, { onDelete: 'set null' }),
    period: campaignPolicyPeriod('period').notNull(),
    value: integer('value').notNull(),
    config: text('config'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: CampaignPoliciesTable) => [
    index('campaign_policies_campaign_idx').on(table.campaignId),
    index('campaign_policies_type_idx').on(table.policyType),
    index('campaign_policies_scope_idx').on(table.scopeType),
    index('campaign_policies_active_idx').on(table.active),
    index('campaign_policies_created_at_idx').on(table.createdAt),
  ],
);
