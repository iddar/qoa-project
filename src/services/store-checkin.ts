import { and, eq, gte } from 'drizzle-orm';
import { db } from '../db/client';
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

export const createStoreCheckin = async (input: CreateCheckinInput): Promise<CreateCheckinResult> => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.expiresAfterMinutes ?? 1440) * 60_000);

  const [created] = await db
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
    });

  if (!created) {
    throw new Error('STORE_CHECKIN_CREATE_FAILED');
  }

  return created;
};

export const findPendingCheckinsForUserAndStore = async (userId: string, storeId: string) => {
  const now = new Date();
  const rows = await db
    .select()
    .from(storeCheckins)
    .where(
      and(
        eq(storeCheckins.userId, userId),
        eq(storeCheckins.storeId, storeId),
        eq(storeCheckins.status, 'pending' as const),
        gte(storeCheckins.expiresAt, now),
      ),
    )
    .orderBy(storeCheckins.checkedInAt);

  return rows;
};

export const findPendingCheckinsForStore = async (storeId: string, options?: { status?: 'pending'; limit?: number }) => {
  const limit = options?.limit ?? 50;
  const conditions = [eq(storeCheckins.storeId, storeId)];

  if (options?.status) {
    conditions.push(eq(storeCheckins.status, options.status));
  }

  const rows = await db
    .select()
    .from(storeCheckins)
    .where(and(...conditions))
    .orderBy(storeCheckins.checkedInAt)
    .limit(limit);

  return rows;
};

export const matchCheckinWithTransaction = async (checkinId: string, transactionId: string) => {
  const now = new Date();

  const [result] = await db
    .update(storeCheckins)
    .set({
      status: 'matched' as const,
      matchedTransactionId: transactionId,
      matchedAt: now,
      updatedAt: now,
    })
    .where(eq(storeCheckins.id, checkinId))
    .returning({ id: storeCheckins.id });

  if (!result) {
    throw new Error('STORE_CHECKIN_MATCH_FAILED');
  }

  return result;
};

export const autoMatchCheckinWithTransaction = async (userId: string, storeId: string, transactionId: string) => {
  const pending = await findPendingCheckinsForUserAndStore(userId, storeId);
  if (pending.length === 0) {
    return null;
  }

  // Match the most recent pending checkin
  const checkin = pending[pending.length - 1];
  await matchCheckinWithTransaction(checkin.id, transactionId);
  return checkin;
};
