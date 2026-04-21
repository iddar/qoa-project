import { index, integer, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { stores } from './stores';
import { users } from './users';

export const userStoreEnrollmentSource = pgEnum('user_store_enrollment_source', ['whatsapp_qr']);

type UserStoreEnrollmentsTable = {
  userId: unknown;
  storeId: unknown;
  source: unknown;
  firstEnrolledAt: unknown;
  lastEnrolledAt: unknown;
};

export const userStoreEnrollments = pgTable(
  'user_store_enrollments',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    source: userStoreEnrollmentSource('source').notNull().default('whatsapp_qr'),
    firstEnrolledAt: timestamp('first_enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    lastEnrolledAt: timestamp('last_enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    enrollmentCount: integer('enrollment_count').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table: UserStoreEnrollmentsTable) => [
    uniqueIndex('user_store_enrollments_user_store_key').on(table.userId, table.storeId),
    index('user_store_enrollments_user_idx').on(table.userId),
    index('user_store_enrollments_store_idx').on(table.storeId),
    index('user_store_enrollments_source_idx').on(table.source),
    index('user_store_enrollments_first_enrolled_idx').on(table.firstEnrolledAt),
    index('user_store_enrollments_last_enrolled_idx').on(table.lastEnrolledAt),
  ],
);
