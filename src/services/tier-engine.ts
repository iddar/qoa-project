import { and, desc, eq, gt, or } from 'drizzle-orm';
import { db, type Database } from '../db/client';
import { accumulations, campaignTiers, cards, tierBenefits, transactionItems } from '../db/schema';

type TierRow = {
  id: string;
  campaignId: string;
  name: string;
  order: number;
  thresholdValue: number;
  windowUnit: 'day' | 'month' | 'year';
  windowValue: number;
  minPurchaseCount: number | null;
  minPurchaseAmount: number | null;
  qualificationMode: 'any' | 'all';
  graceDays: number;
};

type TierBenefitRow = {
  id: string;
  tierId: string;
  type: 'discount' | 'reward' | 'multiplier' | 'free_product';
  config: string | null;
};

type CardTierState = {
  id: string;
  currentTierId: string | null;
  tierGraceUntil: Date | null;
};

type WindowMetrics = {
  purchaseCount: number;
  purchaseAmount: number;
};

export type TierSnapshot = {
  id: string;
  name: string;
  order: number;
  thresholdValue: number;
  windowUnit: 'day' | 'month' | 'year';
  windowValue: number;
  minPurchaseCount?: number;
  minPurchaseAmount?: number;
  qualificationMode: 'any' | 'all';
  graceDays: number;
  benefits: Array<{
    id: string;
    type: 'discount' | 'reward' | 'multiplier' | 'free_product';
    config?: string;
  }>;
};

export type TierEvaluationResult = {
  cardId: string;
  campaignId: string;
  tierState: 'unqualified' | 'qualified' | 'at_risk';
  currentTierId?: string;
  currentTier?: TierSnapshot;
  previousTierId?: string;
  graceUntil?: string;
  evaluatedAt: string;
  changed: boolean;
};

const subtractWindow = (now: Date, unit: TierRow['windowUnit'], value: number) => {
  const next = new Date(now);
  if (unit === 'day') {
    next.setUTCDate(next.getUTCDate() - value);
    return next;
  }

  if (unit === 'month') {
    next.setUTCMonth(next.getUTCMonth() - value);
    return next;
  }

  next.setUTCFullYear(next.getUTCFullYear() - value);
  return next;
};

const toTierSnapshot = (tier: TierRow, benefits: TierBenefitRow[]): TierSnapshot => ({
  id: tier.id,
  name: tier.name,
  order: tier.order,
  thresholdValue: tier.thresholdValue,
  windowUnit: tier.windowUnit,
  windowValue: tier.windowValue,
  minPurchaseCount: tier.minPurchaseCount ?? undefined,
  minPurchaseAmount: tier.minPurchaseAmount ?? undefined,
  qualificationMode: tier.qualificationMode,
  graceDays: tier.graceDays,
  benefits: benefits.map((entry) => ({
    id: entry.id,
    type: entry.type,
    config: entry.config ?? undefined,
  })),
});

const qualifiesTier = (tier: TierRow, metrics: WindowMetrics) => {
  const countRule = tier.minPurchaseCount === null ? null : metrics.purchaseCount >= tier.minPurchaseCount;
  const amountRule = tier.minPurchaseAmount === null ? null : metrics.purchaseAmount >= tier.minPurchaseAmount;

  if (countRule === null && amountRule === null) {
    return false;
  }

  if (countRule !== null && amountRule !== null) {
    return tier.qualificationMode === 'all' ? countRule && amountRule : countRule || amountRule;
  }

  return Boolean(countRule ?? amountRule);
};

const resolveWindowMetrics = (
  tier: TierRow,
  now: Date,
  accumulationsRows: Array<{ transactionItemId: string | null; createdAt: Date }>,
  itemMetrics: Map<string, { transactionId: string; amount: number }>,
): WindowMetrics => {
  const windowStart = subtractWindow(now, tier.windowUnit, tier.windowValue);
  const purchaseIds = new Set<string>();
  let purchaseAmount = 0;

  for (const entry of accumulationsRows) {
    if (entry.createdAt < windowStart || !entry.transactionItemId) {
      continue;
    }

    const metric = itemMetrics.get(entry.transactionItemId);
    if (!metric) {
      continue;
    }

    purchaseIds.add(metric.transactionId);
    purchaseAmount += metric.amount;
  }

  return {
    purchaseCount: purchaseIds.size,
    purchaseAmount,
  };
};

export const evaluateCardTier = async (params: {
  cardId: string;
  campaignId: string;
  at?: Date;
  database?: Database;
}): Promise<TierEvaluationResult> => {
  const now = params.at ?? new Date();
  const database = params.database ?? db;

  const [card] = (await database
    .select({
      id: cards.id,
      currentTierId: cards.currentTierId,
      tierGraceUntil: cards.tierGraceUntil,
    })
    .from(cards)
    .where(eq(cards.id, params.cardId))) as CardTierState[];

  if (!card) {
    return {
      cardId: params.cardId,
      campaignId: params.campaignId,
      tierState: 'unqualified',
      evaluatedAt: now.toISOString(),
      changed: false,
    };
  }

  const tiers = (await database
    .select()
    .from(campaignTiers)
    .where(eq(campaignTiers.campaignId, params.campaignId))
    .orderBy(desc(campaignTiers.order), desc(campaignTiers.thresholdValue))) as TierRow[];

  if (tiers.length === 0) {
    await database
      .update(cards)
      .set({
        currentTierId: null,
        tierGraceUntil: null,
        tierLastEvaluatedAt: now,
      })
      .where(eq(cards.id, params.cardId));

    return {
      cardId: params.cardId,
      campaignId: params.campaignId,
      tierState: 'unqualified',
      previousTierId: card.currentTierId ?? undefined,
      evaluatedAt: now.toISOString(),
      changed: card.currentTierId !== null || card.tierGraceUntil !== null,
    };
  }

  const maxWindowTier = tiers.reduce(
    (winner, tier) => {
      if (!winner) {
        return tier;
      }
      return subtractWindow(now, tier.windowUnit, tier.windowValue) <
        subtractWindow(now, winner.windowUnit, winner.windowValue)
        ? tier
        : winner;
    },
    null as TierRow | null,
  );

  const rangeStart = maxWindowTier ? subtractWindow(now, maxWindowTier.windowUnit, maxWindowTier.windowValue) : now;
  const rangeStartInclusive = new Date(rangeStart.getTime() - 1);
  const accrualRows = (await database
    .select({
      transactionItemId: accumulations.transactionItemId,
      createdAt: accumulations.createdAt,
    })
    .from(accumulations)
    .where(
      and(
        eq(accumulations.cardId, params.cardId),
        eq(accumulations.campaignId, params.campaignId),
        gt(accumulations.createdAt, rangeStartInclusive),
      ),
    )) as Array<{ transactionItemId: string | null; createdAt: Date }>;

  const itemIds = [
    ...new Set(accrualRows.map((entry) => entry.transactionItemId).filter((value): value is string => Boolean(value))),
  ];
  const itemRows =
    itemIds.length === 0
      ? []
      : ((await database
          .select({
            id: transactionItems.id,
            transactionId: transactionItems.transactionId,
            amount: transactionItems.amount,
            quantity: transactionItems.quantity,
          })
          .from(transactionItems)
          .where(or(...itemIds.map((id) => eq(transactionItems.id, id))))) as Array<{
          id: string;
          transactionId: string;
          amount: number;
          quantity: number;
        }>);

  const itemMetrics = new Map(
    itemRows.map((entry) => [entry.id, { transactionId: entry.transactionId, amount: entry.amount * entry.quantity }]),
  );
  const qualifiedTier =
    tiers.find((tier) => qualifiesTier(tier, resolveWindowMetrics(tier, now, accrualRows, itemMetrics))) ?? null;
  const previousTier = tiers.find((tier) => tier.id === card.currentTierId) ?? null;

  let nextTierId: string | null = card.currentTierId;
  let nextGraceUntil: Date | null = card.tierGraceUntil;
  let tierState: TierEvaluationResult['tierState'] = 'unqualified';

  if (qualifiedTier) {
    if (!previousTier || qualifiedTier.order >= previousTier.order) {
      nextTierId = qualifiedTier.id;
      nextGraceUntil = null;
      tierState = 'qualified';
    } else {
      if (card.tierGraceUntil && card.tierGraceUntil <= now) {
        nextTierId = qualifiedTier.id;
        nextGraceUntil = null;
        tierState = 'qualified';
      } else if (!card.tierGraceUntil) {
        const grace = new Date(now);
        grace.setUTCDate(grace.getUTCDate() + Math.max(previousTier.graceDays, 0));
        nextGraceUntil = grace;
        tierState = 'at_risk';
      } else {
        nextGraceUntil = card.tierGraceUntil;
        tierState = 'at_risk';
      }
    }
  } else if (previousTier) {
    if (card.tierGraceUntil && card.tierGraceUntil <= now) {
      nextTierId = null;
      nextGraceUntil = null;
      tierState = 'unqualified';
    } else if (!card.tierGraceUntil) {
      const grace = new Date(now);
      grace.setUTCDate(grace.getUTCDate() + Math.max(previousTier.graceDays, 0));
      nextGraceUntil = grace;
      tierState = 'at_risk';
    } else {
      nextGraceUntil = card.tierGraceUntil;
      tierState = 'at_risk';
    }
  }

  if (!nextTierId) {
    tierState = 'unqualified';
  }

  const changed =
    nextTierId !== card.currentTierId ||
    (nextGraceUntil?.toISOString() ?? null) !== (card.tierGraceUntil?.toISOString() ?? null);

  await database
    .update(cards)
    .set({
      currentTierId: nextTierId,
      tierGraceUntil: nextGraceUntil,
      tierLastEvaluatedAt: now,
    })
    .where(eq(cards.id, params.cardId));

  const tierBenefitsRows = nextTierId
    ? ((await database.select().from(tierBenefits).where(eq(tierBenefits.tierId, nextTierId))) as TierBenefitRow[])
    : [];
  const currentTier = tiers.find((entry) => entry.id === nextTierId) ?? null;

  return {
    cardId: params.cardId,
    campaignId: params.campaignId,
    tierState,
    currentTierId: nextTierId ?? undefined,
    currentTier: currentTier ? toTierSnapshot(currentTier, tierBenefitsRows) : undefined,
    previousTierId: card.currentTierId ?? undefined,
    graceUntil: nextGraceUntil?.toISOString(),
    evaluatedAt: now.toISOString(),
    changed,
  };
};
