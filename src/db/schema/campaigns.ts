import { index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
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

type CampaignsTable = {
  cpgId: unknown;
  status: unknown;
  createdAt: unknown;
};

type CampaignAuditLogsTable = {
  campaignId: unknown;
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
