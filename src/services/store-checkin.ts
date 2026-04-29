import { and, eq, gt } from 'drizzle-orm';
import { db, type Database } from '../db/client';
import { storeCheckins } from '../db/schema';

export type CreateCheckinInput = {
  userId: string;
  storeId: string;
  expiresAfterMinutes?: number;
};

export type CreateCheckinResult = {
  id: string;
  status: 'pending';
  checkedInAt: Date;
  expiresAt: Date;
};

type StoreCheckinRow = {
  id: string;
  userId: string;
  storeId: string;
  status: 'pending' | 'matched' | 'expired';
  matchedTransactionId: string | null;
  checkedInAt: Date;
  matchedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date | null;
};

export const createStoreCheckin = async (input: CreateCheckinInput): Promise<CreateCheckinResult> => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.expiresAfterMinutes ?? 1440) * 60_000);

  const [created] = (await db
    .insert(storeCheckins)
    .values({
      userId: input.userId,
      storeId: input.storeId,
      status: 'pending' as const,
      checkedInAt: now,
      expiresAt,
    })
    .returning({
      id: storeCheckins.id,
      status: storeCheckins.status,
      checkedInAt: storeCheckins.checkedInAt,
      expiresAt: storeCheckins.expiresAt,
    })) as Array<CreateCheckinResult>;

  if (!created) {
    throw new Error('STORE_CHECKIN_CREATE_FAILED');
  }

  return created;
};

export const findPendingCheckinsForUserAndStore = async (
  userId: string,
  storeId: string,
  database: Database = db,
): Promise<StoreCheckinRow[]> => {
  const now = new Date();
  const rows = (await database
    .select()
    .from(storeCheckins)
    .where(
      and(
        eq(storeCheckins.userId, userId),
        eq(storeCheckins.storeId, storeId),
        eq(storeCheckins.status, 'pending' as const),
        gt(storeCheckins.expiresAt, now),
      ),
    )
    .orderBy(storeCheckins.checkedInAt)) as StoreCheckinRow[];

  return rows;
};

export const findPendingCheckinsForStore = async (
  storeId: string,
  options?: { status?: 'pending'; limit?: number },
  database: Database = db,
): Promise<StoreCheckinRow[]> => {
  const limit = options?.limit ?? 50;
  const conditions = [eq(storeCheckins.storeId, storeId)];

  if (options?.status) {
    conditions.push(eq(storeCheckins.status, options.status));
    if (options.status === 'pending') {
      conditions.push(gt(storeCheckins.expiresAt, new Date()));
    }
  }

  const rows = (await database
    .select()
    .from(storeCheckins)
    .where(and(...conditions))
    .orderBy(storeCheckins.checkedInAt)
    .limit(limit)) as StoreCheckinRow[];

  return rows;
};

export const matchCheckinWithTransaction = async (
  checkinId: string,
  transactionId: string,
  database: Database = db,
) => {
  const now = new Date();

  const [result] = (await database
    .update(storeCheckins)
    .set({
      status: 'matched' as const,
      matchedTransactionId: transactionId,
      matchedAt: now,
      updatedAt: now,
    })
    .where(eq(storeCheckins.id, checkinId))
    .returning({ id: storeCheckins.id })) as Array<{ id: string }>;

  if (!result) {
    throw new Error('STORE_CHECKIN_MATCH_FAILED');
  }

  return result;
};

export const autoMatchCheckinWithTransaction = async (
  userId: string,
  storeId: string,
  transactionId: string,
  database: Database = db,
) => {
  const pending = await findPendingCheckinsForUserAndStore(userId, storeId, database);
  if (pending.length === 0) {
    return null;
  }

  // Match the most recent pending checkin
  const checkin = pending[pending.length - 1] as StoreCheckinRow;
  await matchCheckinWithTransaction(checkin.id, transactionId, database);
  return checkin;
};
