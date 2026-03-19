import { and, eq, or } from 'drizzle-orm';
import { db } from '../db/client';
import { cpgStoreRelations } from '../db/schema';

type CpgStoreRelationSource = 'first_activity' | 'manual' | 'import' | 'capture' | 'organic';

export const isStoreRelatedToCpg = async (storeId: string, cpgId: string) => {
  const [row] = (await db
    .select({ id: cpgStoreRelations.id })
    .from(cpgStoreRelations)
    .where(
      and(
        eq(cpgStoreRelations.storeId, storeId),
        eq(cpgStoreRelations.cpgId, cpgId),
        eq(cpgStoreRelations.status, 'active'),
      ),
    )
    .limit(1)) as Array<{ id: string }>;

  return Boolean(row);
};

export const getRelatedStoreIdsForCpg = async (cpgId: string) => {
  const rows = (await db
    .select({ storeId: cpgStoreRelations.storeId })
    .from(cpgStoreRelations)
    .where(and(eq(cpgStoreRelations.cpgId, cpgId), eq(cpgStoreRelations.status, 'active')))) as Array<{
    storeId: string;
  }>;

  return rows.map((row) => row.storeId);
};

export const getRelatedCpgIdsForStore = async (storeId: string) => {
  const rows = (await db
    .select({ cpgId: cpgStoreRelations.cpgId })
    .from(cpgStoreRelations)
    .where(and(eq(cpgStoreRelations.storeId, storeId), eq(cpgStoreRelations.status, 'active')))) as Array<{
    cpgId: string;
  }>;

  return rows.map((row) => row.cpgId);
};

export const touchStoreCpgRelations = async (payload: {
  storeId: string;
  cpgIds: string[];
  source?: CpgStoreRelationSource;
  actorUserId?: string | null;
  touchedAt?: Date;
}) => {
  const uniqueCpgIds = [...new Set(payload.cpgIds.filter(Boolean))];
  if (uniqueCpgIds.length === 0) {
    return;
  }

  const now = payload.touchedAt ?? new Date();
  const existing = (await db
    .select({ id: cpgStoreRelations.id, cpgId: cpgStoreRelations.cpgId })
    .from(cpgStoreRelations)
    .where(
      and(
        eq(cpgStoreRelations.storeId, payload.storeId),
        or(...uniqueCpgIds.map((cpgId) => eq(cpgStoreRelations.cpgId, cpgId))),
      ),
    )) as Array<{
    id: string;
    cpgId: string;
  }>;

  const existingByCpgId = new Map(existing.map((row) => [row.cpgId, row]));

  for (const cpgId of uniqueCpgIds) {
    const row = existingByCpgId.get(cpgId);
    if (row) {
      await db
        .update(cpgStoreRelations)
        .set({
          status: 'active',
          lastActivityAt: now,
          updatedAt: now,
        })
        .where(eq(cpgStoreRelations.id, row.id));
      continue;
    }

    await db.insert(cpgStoreRelations).values({
      cpgId,
      storeId: payload.storeId,
      status: 'active',
      source: payload.source ?? 'first_activity',
      firstActivityAt: now,
      lastActivityAt: now,
      createdByUserId: payload.actorUserId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }
};

export const ensureOrganicRelation = async (storeId: string, cpgId: string) => {
  const existing = (await db
    .select({ id: cpgStoreRelations.id, source: cpgStoreRelations.source })
    .from(cpgStoreRelations)
    .where(and(
      eq(cpgStoreRelations.storeId, storeId),
      eq(cpgStoreRelations.cpgId, cpgId),
    ))
    .limit(1)) as Array<{ id: string; source: string }>;

  if (existing && existing.length > 0) {
    return existing[0];
  }

  const now = new Date();
  const [created] = await db.insert(cpgStoreRelations).values({
    storeId,
    cpgId,
    status: 'active',
    source: 'organic',
    firstActivityAt: now,
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return created;
};
