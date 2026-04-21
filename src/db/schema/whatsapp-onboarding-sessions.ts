import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { stores } from './stores';
import { users } from './users';

export const whatsappOnboardingState = pgEnum('whatsapp_onboarding_state', [
  'awaiting_store',
  'awaiting_name',
  'awaiting_birth_date',
  'completed',
]);

type WhatsappOnboardingSessionsTable = {
  phone: unknown;
  userId: unknown;
  pendingStoreId: unknown;
  state: unknown;
  lastInboundAt: unknown;
  completedAt: unknown;
};

export const whatsappOnboardingSessions = pgTable(
  'whatsapp_onboarding_sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    phone: varchar('phone', { length: 20 }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    pendingStoreId: uuid('pending_store_id').references(() => stores.id, { onDelete: 'set null' }),
    state: whatsappOnboardingState('state').notNull().default('awaiting_store'),
    lastInboundMessageId: varchar('last_inbound_message_id', { length: 64 }),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
    lastOutboundMessageId: varchar('last_outbound_message_id', { length: 64 }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: WhatsappOnboardingSessionsTable) => [
    uniqueIndex('whatsapp_onboarding_sessions_phone_key').on(table.phone),
    index('whatsapp_onboarding_sessions_user_idx').on(table.userId),
    index('whatsapp_onboarding_sessions_pending_store_idx').on(table.pendingStoreId),
    index('whatsapp_onboarding_sessions_state_idx').on(table.state),
    index('whatsapp_onboarding_sessions_last_inbound_idx').on(table.lastInboundAt),
    index('whatsapp_onboarding_sessions_completed_idx').on(table.completedAt),
  ],
);
