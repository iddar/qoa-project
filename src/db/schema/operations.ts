import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { campaigns } from './campaigns';
import { cards } from './cards';

export const whatsappDirection = pgEnum('whatsapp_direction', ['inbound', 'outbound']);
export const whatsappMessageStatus = pgEnum('whatsapp_message_status', ['received', 'processed', 'error', 'replayed']);

export const reminderJobChannel = pgEnum('reminder_job_channel', ['whatsapp']);
export const reminderJobStatus = pgEnum('reminder_job_status', [
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);
export const alertSeverity = pgEnum('alert_severity', ['low', 'medium', 'high', 'critical']);
export const alertNotificationChannel = pgEnum('alert_notification_channel', ['email']);
export const alertNotificationStatus = pgEnum('alert_notification_status', ['mocked', 'failed']);

type WhatsappMessagesTable = {
  provider: unknown;
  externalMessageId: unknown;
  status: unknown;
  receivedAt: unknown;
};

type ReminderJobsTable = {
  cardId: unknown;
  campaignId: unknown;
  channel: unknown;
  status: unknown;
  scheduledFor: unknown;
  createdAt: unknown;
  idempotencyKey: unknown;
};

type AlertNotificationsTable = {
  channel: unknown;
  severity: unknown;
  status: unknown;
  createdAt: unknown;
};

export const whatsappMessages = pgTable(
  'whatsapp_messages',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    provider: text('provider').notNull().default('meta'),
    externalMessageId: text('external_message_id').notNull(),
    direction: whatsappDirection('direction').notNull().default('inbound'),
    fromPhone: text('from_phone').notNull(),
    toPhone: text('to_phone').notNull(),
    textBody: text('text_body'),
    payload: text('payload').notNull(),
    status: whatsappMessageStatus('status').notNull().default('received'),
    replayCount: integer('replay_count').notNull().default(0),
    error: text('error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    lastReceivedAt: timestamp('last_received_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table: WhatsappMessagesTable) => [
    uniqueIndex('whatsapp_messages_provider_external_key').on(table.provider, table.externalMessageId),
    index('whatsapp_messages_status_idx').on(table.status),
    index('whatsapp_messages_received_at_idx').on(table.receivedAt),
  ],
);

export const reminderJobs = pgTable(
  'reminder_jobs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    channel: reminderJobChannel('channel').notNull().default('whatsapp'),
    status: reminderJobStatus('status').notNull().default('queued'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    payload: text('payload').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    error: text('error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: ReminderJobsTable) => [
    uniqueIndex('reminder_jobs_idempotency_key').on(table.idempotencyKey),
    index('reminder_jobs_card_idx').on(table.cardId),
    index('reminder_jobs_campaign_idx').on(table.campaignId),
    index('reminder_jobs_channel_idx').on(table.channel),
    index('reminder_jobs_status_idx').on(table.status),
    index('reminder_jobs_scheduled_for_idx').on(table.scheduledFor),
    index('reminder_jobs_created_at_idx').on(table.createdAt),
  ],
);

export const alertNotifications = pgTable(
  'alert_notifications',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    channel: alertNotificationChannel('channel').notNull().default('email'),
    recipient: text('recipient').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    alertCode: text('alert_code').notNull(),
    severity: alertSeverity('severity').notNull(),
    status: alertNotificationStatus('status').notNull().default('mocked'),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table: AlertNotificationsTable) => [
    index('alert_notifications_channel_idx').on(table.channel),
    index('alert_notifications_severity_idx').on(table.severity),
    index('alert_notifications_status_idx').on(table.status),
    index('alert_notifications_created_at_idx').on(table.createdAt),
  ],
);
