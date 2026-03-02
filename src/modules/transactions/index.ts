import { and, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { authGuard, authPlugin, type AuthContext } from '../../app/plugins/auth';
import { authorizationHeader } from '../../app/plugins/schemas';
import { parseCursor, parseLimit } from '../../app/utils/pagination';
import { db } from '../../db/client';
import {
  accumulations,
  balances,
  campaignBalances,
  campaignPolicies,
  campaignSubscriptions,
  cards,
  campaigns,
  products,
  stores,
  transactionItems,
  transactions,
  users,
  webhookReceipts,
} from '../../db/schema';
import { UNIVERSAL_CAMPAIGN_KEY, ensureUserUniversalWalletCard } from '../../services/wallet-onboarding';
import { evaluateCardTier } from '../../services/tier-engine';
import type { StatusHandler } from '../../types/handlers';
import {
  transactionCreateRequest,
  transactionDetailResponse,
  transactionListQuery,
  transactionListResponse,
  transactionResponse,
  webhookMetricsQuery,
  webhookMetricsResponse,
  webhookReceiptListQuery,
  webhookReceiptListResponse,
  transactionWebhookRequest,
  transactionWebhookResponse,
} from './model';

const allowedRoles = ['store_staff', 'store_admin', 'cpg_admin', 'qoa_support', 'qoa_admin'] as const;
const walletRoles = ['consumer', 'customer'] as const;

const webhookHeaderSchema = t.Object({
  authorization: t.Optional(
    t.String({
      description: 'Bearer <accessToken>',
    }),
  ),
  'x-webhook-signature': t.Optional(
    t.String({
      description: 'HMAC SHA-256 hexadecimal del payload',
    }),
  ),
});

type TransactionRow = {
  id: string;
  userId: string;
  storeId: string;
  cardId: string | null;
  totalAmount: number;
  metadata: string | null;
  createdAt: Date;
};

type TransactionItemRow = {
  id: string;
  transactionId: string;
  productId: string;
  quantity: number;
  amount: number;
  metadata: string | null;
};

type AccumulationRow = {
  id: string;
  transactionItemId: string | null;
  cardId: string;
  campaignId: string;
  amount: number;
  balanceAfter: number;
  sourceType: 'transaction_item' | 'code_capture';
  codeCaptureId: string | null;
};

type CampaignBalanceRow = {
  id: string;
  cardId: string;
  campaignId: string;
  current: number;
  lifetime: number;
};

type CampaignPolicyRow = {
  id: string;
  campaignId: string;
  policyType: 'max_accumulations' | 'min_amount' | 'min_quantity' | 'cooldown';
  scopeType: 'campaign' | 'brand' | 'product';
  scopeId: string | null;
  period: 'transaction' | 'day' | 'week' | 'month' | 'lifetime';
  value: number;
  active: boolean;
  createdAt: Date;
};

type ResolvedCatalogItem = {
  ref: string;
  id: string;
  brandId: string;
};

type CreateContext = {
  auth: AuthContext | null;
  body: {
    userId: string;
    storeId: string;
    cardId?: string;
    items: Array<{
      productId: string;
      quantity?: number;
      amount?: number;
      metadata?: string;
    }>;
    metadata?: string;
    idempotencyKey?: string;
  };
  status: StatusHandler;
};

type ListContext = {
  auth: AuthContext | null;
  query: {
    userId?: string;
    storeId?: string;
    cardId?: string;
    q?: string;
    from?: string;
    to?: string;
    limit?: string;
    cursor?: string;
  };
  status: StatusHandler;
};

type ParamsContext = {
  auth: AuthContext | null;
  params: {
    transactionId: string;
  };
  status: StatusHandler;
};

const isUserTokenAuth = (auth: AuthContext | null): auth is Extract<AuthContext, { type: 'jwt' | 'dev' }> =>
  Boolean(auth && (auth.type === 'jwt' || auth.type === 'dev'));

const isWalletUser = (auth: AuthContext | null): auth is Extract<AuthContext, { type: 'jwt' | 'dev' }> =>
  isUserTokenAuth(auth) && walletRoles.includes(auth.role as (typeof walletRoles)[number]);

type WebhookContext = {
  body: {
    source: string;
    externalEventId?: string;
    userId: string;
    storeId: string;
    cardId?: string;
    items: Array<{
      productId: string;
      quantity?: number;
      amount?: number;
      metadata?: string;
    }>;
    metadata?: string;
  };
  headers: Record<string, string | undefined>;
  status: StatusHandler;
};

type WebhookReceiptRow = {
  id: string;
  source: string;
  hash: string;
  externalEventId: string | null;
  transactionId: string | null;
  status: string;
  replayCount: number;
  error: string | null;
  receivedAt: Date;
  lastReceivedAt: Date | null;
  processedAt: Date | null;
};

type ReceiptListContext = {
  query: {
    source?: string;
    status?: string;
    limit?: string;
    cursor?: string;
  };
  status: StatusHandler;
};

type MetricsContext = {
  query: {
    source?: string;
    from?: string;
    to?: string;
  };
  status: StatusHandler;
};

const buildItemsMap = (items: TransactionItemRow[]) => {
  const map = new Map<string, TransactionItemRow[]>();
  for (const item of items) {
    const current = map.get(item.transactionId) ?? [];
    current.push(item);
    map.set(item.transactionId, current);
  }
  return map;
};

const toListPayload = (tx: TransactionRow, items: TransactionItemRow[]) => ({
  id: tx.id,
  userId: tx.userId,
  storeId: tx.storeId,
  cardId: tx.cardId ?? undefined,
  totalAmount: tx.totalAmount,
  createdAt: tx.createdAt.toISOString(),
  items: items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    amount: item.amount,
    metadata: item.metadata ?? undefined,
  })),
});

const toDetailPayload = (tx: TransactionRow, items: TransactionItemRow[], txAccumulations: AccumulationRow[] = []) => ({
  ...toListPayload(tx, items),
  accumulations: txAccumulations.map((entry) => ({
    cardId: entry.cardId,
    campaignId: entry.campaignId,
    accumulated: entry.amount,
    newBalance: entry.balanceAfter,
    sourceType: entry.sourceType,
    codeCaptureId: entry.codeCaptureId ?? undefined,
    codeValue: undefined,
  })),
});

const normalizeItems = (items: Array<{ productId: string; quantity?: number; amount?: number; metadata?: string }>) =>
  items.map((item) => {
    const quantity = Math.max(item.quantity ?? 1, 1);
    const amount = item.amount ?? 0;
    return {
      productId: item.productId,
      quantity,
      amount,
      metadata: item.metadata ?? null,
    };
  });

const toPeriodStart = (period: CampaignPolicyRow['period'], now: Date) => {
  if (period === 'day') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  }

  if (period === 'week') {
    const currentUtcDay = now.getUTCDay();
    const diffToMonday = (currentUtcDay + 6) % 7;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday, 0, 0, 0, 0));
  }

  if (period === 'month') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  }

  return null;
};

const resolveCatalogItems = async (productRefs: string[]) => {
  const resolved = new Map<string, ResolvedCatalogItem>();

  for (const productRef of productRefs) {
    const [product] = (await db
      .select({
        id: products.id,
        sku: products.sku,
        brandId: products.brandId,
      })
      .from(products)
      .where(or(eq(products.id, productRef), eq(products.sku, productRef)))
      .limit(1)) as Array<{ id: string; sku: string; brandId: string }>;

    if (!product) {
      return null;
    }

    resolved.set(productRef, {
      ref: productRef,
      id: product.id,
      brandId: product.brandId,
    });
  }

  return resolved;
};

const ensureTransactionEntities = async (
  payload: {
    userId: string;
    storeId: string;
    cardId?: string;
    items?: Array<{ productId: string }>;
  },
  status: StatusHandler,
) => {
  const [user] = (await db.select({ id: users.id }).from(users).where(eq(users.id, payload.userId))) as Array<{
    id: string;
  }>;
  if (!user) {
    return status(404, {
      error: {
        code: 'USER_NOT_FOUND',
        message: 'Usuario no encontrado',
      },
    });
  }

  const [store] = (await db.select({ id: stores.id }).from(stores).where(eq(stores.id, payload.storeId))) as Array<{
    id: string;
  }>;
  if (!store) {
    return status(404, {
      error: {
        code: 'STORE_NOT_FOUND',
        message: 'Tienda no encontrada',
      },
    });
  }

  if (payload.cardId) {
    const [card] = (await db
      .select({ id: cards.id, userId: cards.userId })
      .from(cards)
      .where(eq(cards.id, payload.cardId))) as Array<{
      id: string;
      userId: string;
    }>;
    if (!card) {
      return status(404, {
        error: {
          code: 'CARD_NOT_FOUND',
          message: 'Tarjeta no encontrada',
        },
      });
    }

    if (card.userId !== payload.userId) {
      return status(400, {
        error: {
          code: 'CARD_USER_MISMATCH',
          message: 'La tarjeta no pertenece al usuario indicado',
        },
      });
    }
  }

  const catalogItems = new Map<string, ResolvedCatalogItem>();
  if (payload.items && payload.items.length > 0) {
    const productRefs = [...new Set(payload.items.map((item) => item.productId))];
    const resolvedCatalogItems = await resolveCatalogItems(productRefs);
    if (!resolvedCatalogItems) {
      return {
        error: status(404, {
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: 'Uno o más productos no existen',
          },
        }),
        catalogItems,
      };
    }

    for (const [key, value] of resolvedCatalogItems.entries()) {
      catalogItems.set(key, value);
    }
  }

  return {
    error: null,
    catalogItems,
  };
};

const resolveCardForTransaction = async (payload: { userId: string; cardId?: string }) => {
  if (payload.cardId) {
    const [card] = (await db
      .select({ id: cards.id, campaignId: cards.campaignId, userId: cards.userId })
      .from(cards)
      .where(eq(cards.id, payload.cardId))) as Array<{ id: string; campaignId: string; userId: string }>;

    if (!card || card.userId !== payload.userId) {
      return null;
    }

    return {
      cardId: card.id,
      baseCampaignId: card.campaignId,
    };
  }

  const ensured = await ensureUserUniversalWalletCard(payload.userId);
  return {
    cardId: ensured.cardId,
    baseCampaignId: ensured.campaignId,
  };
};

const resolveEligibleCampaignIds = async (payload: { userId: string; cardId: string; baseCampaignId: string }) => {
  const [universal] = (await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.key, UNIVERSAL_CAMPAIGN_KEY))) as Array<{ id: string }>;

  const subscribedRows = (await db
    .select({ campaignId: campaignSubscriptions.campaignId })
    .from(campaignSubscriptions)
    .where(and(eq(campaignSubscriptions.userId, payload.userId), eq(campaignSubscriptions.status, 'subscribed')))) as Array<{
    campaignId: string;
  }>;

  const openRows = (await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.status, 'active'), eq(campaigns.enrollmentMode, 'open')))) as Array<{ id: string }>;

  const ids = new Set<string>([payload.baseCampaignId]);
  if (universal?.id) {
    ids.add(universal.id);
  }
  for (const row of subscribedRows) {
    ids.add(row.campaignId);
  }
  for (const row of openRows) {
    ids.add(row.id);
  }

  return [...ids];
};

const createOrReplayTransaction = async (payload: {
  userId: string;
  storeId: string;
  cardId?: string;
  metadata?: string;
  idempotencyKey?: string;
  items: Array<{ productId: string; quantity?: number; amount?: number; metadata?: string }>;
  catalogItems: Map<string, ResolvedCatalogItem>;
}) => {
  if (payload.idempotencyKey) {
    const [existing] = (await db
      .select()
      .from(transactions)
      .where(eq(transactions.idempotencyKey, payload.idempotencyKey))) as TransactionRow[];

    if (existing) {
      const existingItems = (await db
        .select()
        .from(transactionItems)
        .where(eq(transactionItems.transactionId, existing.id))) as TransactionItemRow[];

      const itemIds = existingItems.map((item) => item.id);
      const existingAccumulations =
        itemIds.length > 0
          ? ((await db
              .select()
              .from(accumulations)
              .where(or(...itemIds.map((id) => eq(accumulations.transactionItemId, id))))) as AccumulationRow[])
          : [];

      return {
        statusCode: 200,
        transaction: existing,
        items: existingItems,
        accumulations: existingAccumulations,
      };
    }
  }

  const normalizedItems = normalizeItems(payload.items).map((item) => {
    const resolved = payload.catalogItems.get(item.productId);
    return {
      ...item,
      productId: resolved?.id ?? item.productId,
      brandId: resolved?.brandId,
    };
  });
  const totalAmount = normalizedItems.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  const resolvedCard = await resolveCardForTransaction({
    userId: payload.userId,
    cardId: payload.cardId,
  });

  const [created] = (await db
    .insert(transactions)
    .values({
      userId: payload.userId,
      storeId: payload.storeId,
      cardId: resolvedCard?.cardId ?? null,
      totalAmount,
      metadata: payload.metadata ?? null,
      idempotencyKey: payload.idempotencyKey ?? null,
    })
    .returning()) as TransactionRow[];

  if (!created) {
    return null;
  }

  await db.insert(transactionItems).values(
    normalizedItems.map((item) => ({
      transactionId: created.id,
      productId: item.productId,
      quantity: item.quantity,
      amount: item.amount,
      metadata: item.metadata,
    })),
  );

  const createdItems = (await db
    .select()
    .from(transactionItems)
    .where(eq(transactionItems.transactionId, created.id))) as TransactionItemRow[];

  let createdAccumulations: AccumulationRow[] = [];

  if (resolvedCard) {
    const now = new Date();
    const [existingBalance] = (await db.select().from(balances).where(eq(balances.cardId, resolvedCard.cardId))) as Array<{
      id: string;
      current: number;
      lifetime: number;
    }>;

    const campaignIds = await resolveEligibleCampaignIds({
      userId: payload.userId,
      cardId: resolvedCard.cardId,
      baseCampaignId: resolvedCard.baseCampaignId,
    });

    const campaignBalanceRows = (await db
      .select()
      .from(campaignBalances)
      .where(and(eq(campaignBalances.cardId, resolvedCard.cardId)))) as CampaignBalanceRow[];
    const campaignBalanceById = new Map(campaignBalanceRows.map((row) => [row.campaignId, row]));

    const itemBrandByProduct = new Map(
      normalizedItems
        .map((item) => {
          if (!item.brandId) {
            return null;
          }
          return [item.productId, item.brandId] as const;
        })
        .filter(Boolean) as ReadonlyArray<readonly [string, string]>,
    );

    const itemTotalsByProduct = new Map<string, number>();
    const itemTotalsByBrand = new Map<string, number>();
    for (const item of normalizedItems) {
      itemTotalsByProduct.set(item.productId, (itemTotalsByProduct.get(item.productId) ?? 0) + item.quantity);
      const brandId = item.brandId;
      if (brandId) {
        itemTotalsByBrand.set(brandId, (itemTotalsByBrand.get(brandId) ?? 0) + item.quantity);
      }
    }

    const accumulationRows: Array<{
      transactionItemId: string;
      cardId: string;
      campaignId: string;
      amount: number;
      balanceAfter: number;
      sourceType: 'transaction_item';
      codeCaptureId: null;
    }> = [];
    let totalAccumulatedAcrossCampaigns = 0;

    for (const campaignId of campaignIds) {
      const activePolicies = (await db
        .select()
        .from(campaignPolicies)
        .where(and(eq(campaignPolicies.campaignId, campaignId), eq(campaignPolicies.active, true)))) as CampaignPolicyRow[];

      const existingCampaignBalance = campaignBalanceById.get(campaignId);
      let currentCampaignBalance = existingCampaignBalance?.current ?? 0;
      let lifetimeCampaignBalance = existingCampaignBalance?.lifetime ?? 0;
      const accumulatedByItem = new Map<string, number>();

      const canAccumulateItem = async (item: TransactionItemRow) => {
        const brandId = itemBrandByProduct.get(item.productId) ?? null;
        const scopedPolicies = activePolicies.filter((policy) => {
          if (policy.scopeType === 'campaign') {
            return true;
          }
          if (policy.scopeType === 'product') {
            return policy.scopeId === item.productId;
          }

          return Boolean(brandId && policy.scopeId === brandId);
        });

        for (const policy of scopedPolicies) {
          if (policy.policyType === 'min_amount') {
            if (totalAmount < policy.value) {
              return false;
            }
            continue;
          }

          if (policy.policyType === 'min_quantity') {
            if (policy.scopeType === 'product') {
              if ((itemTotalsByProduct.get(item.productId) ?? 0) < policy.value) {
                return false;
              }
            } else if (policy.scopeType === 'brand') {
              if (!brandId || (itemTotalsByBrand.get(brandId) ?? 0) < policy.value) {
                return false;
              }
            } else if (item.quantity < policy.value) {
              return false;
            }

            continue;
          }

          if (policy.policyType === 'cooldown') {
            const periodStart = toPeriodStart(policy.period, now);
            if (!periodStart) {
              continue;
            }

            const latestRows = (await db
              .select({ createdAt: accumulations.createdAt })
              .from(accumulations)
              .where(
                and(
                  eq(accumulations.cardId, resolvedCard.cardId),
                  eq(accumulations.campaignId, campaignId),
                  gt(accumulations.createdAt, periodStart),
                ),
              )
              .orderBy(desc(accumulations.createdAt))
              .limit(1)) as Array<{ createdAt: Date }>;
            const latest = latestRows[0];

            if (latest) {
              const hoursSinceLatest = (now.getTime() - latest.createdAt.getTime()) / 36_000_00;
              if (hoursSinceLatest < policy.value) {
                return false;
              }
            }

            continue;
          }

          if (policy.policyType === 'max_accumulations') {
            const accumulatedInTransaction =
              policy.scopeType === 'campaign'
                ? Array.from(accumulatedByItem.values()).reduce((sum, value) => sum + value, 0)
                : policy.scopeType === 'product'
                  ? (accumulatedByItem.get(item.productId) ?? 0)
                  : brandId
                    ? Array.from(accumulatedByItem.entries())
                        .filter(([productId]) => itemBrandByProduct.get(productId) === brandId)
                        .reduce((sum, [, value]) => sum + value, 0)
                    : 0;

            if (policy.period === 'transaction') {
              if (accumulatedInTransaction >= policy.value) {
                return false;
              }
              continue;
            }

            const historicalFilters = [
              eq(accumulations.cardId, resolvedCard.cardId),
              eq(accumulations.campaignId, campaignId),
            ];
            const periodStart = toPeriodStart(policy.period, now);
            if (periodStart) {
              historicalFilters.push(gt(accumulations.createdAt, periodStart));
            }

            const historicalRows = (await db
              .select({ transactionItemId: accumulations.transactionItemId })
              .from(accumulations)
              .where(and(...historicalFilters))) as Array<{ transactionItemId: string | null }>;

            let historicalCount = historicalRows.length;
            if (policy.scopeType !== 'campaign') {
              const historicalItemIds = historicalRows
                .map((entry) => entry.transactionItemId)
                .filter((entry): entry is string => Boolean(entry));

              if (historicalItemIds.length === 0) {
                historicalCount = 0;
              } else {
                const historicalItems = (await db
                  .select({ id: transactionItems.id, productId: transactionItems.productId })
                  .from(transactionItems)
                  .where(or(...historicalItemIds.map((id) => eq(transactionItems.id, id))))) as Array<{
                  id: string;
                  productId: string;
                }>;

                if (policy.scopeType === 'product') {
                  historicalCount = historicalItems.filter((entry) => entry.productId === item.productId).length;
                } else {
                  if (!brandId) {
                    return false;
                  }

                  const brandProducts = (await db
                    .select({ id: products.id })
                    .from(products)
                    .where(eq(products.brandId, brandId))) as Array<{ id: string }>;
                  const brandProductIds = new Set(brandProducts.map((entry) => entry.id));
                  historicalCount = historicalItems.filter((entry) => brandProductIds.has(entry.productId)).length;
                }
              }
            }

            if (historicalCount + accumulatedInTransaction >= policy.value) {
              return false;
            }
          }
        }

        return true;
      };

      let campaignAccumulated = 0;
      for (const item of createdItems) {
        const allowed = await canAccumulateItem(item);
        if (!allowed) {
          continue;
        }

        const amount = item.quantity;
        currentCampaignBalance += amount;
        lifetimeCampaignBalance += amount;
        campaignAccumulated += amount;
        totalAccumulatedAcrossCampaigns += amount;
        accumulatedByItem.set(item.productId, (accumulatedByItem.get(item.productId) ?? 0) + amount);
        accumulationRows.push({
          transactionItemId: item.id,
          cardId: resolvedCard.cardId,
          campaignId,
          amount,
          balanceAfter: currentCampaignBalance,
          sourceType: 'transaction_item',
          codeCaptureId: null,
        });
      }

      if (existingCampaignBalance) {
        if (campaignAccumulated > 0) {
          await db
            .update(campaignBalances)
            .set({
              current: currentCampaignBalance,
              lifetime: lifetimeCampaignBalance,
              updatedAt: new Date(),
            })
            .where(eq(campaignBalances.id, existingCampaignBalance.id));
        }
      } else {
        await db.insert(campaignBalances).values({
          cardId: resolvedCard.cardId,
          campaignId,
          current: currentCampaignBalance,
          lifetime: lifetimeCampaignBalance,
          updatedAt: new Date(),
        });
      }
    }

    const currentTotalBalance = existingBalance?.current ?? 0;
    const lifetimeTotalBalance = existingBalance?.lifetime ?? 0;
    if (existingBalance) {
      await db
        .update(balances)
        .set({
          current: currentTotalBalance + totalAccumulatedAcrossCampaigns,
          lifetime: lifetimeTotalBalance + totalAccumulatedAcrossCampaigns,
          updatedAt: new Date(),
        })
        .where(eq(balances.id, existingBalance.id));
    } else {
      await db.insert(balances).values({
        cardId: resolvedCard.cardId,
        current: totalAccumulatedAcrossCampaigns,
        lifetime: totalAccumulatedAcrossCampaigns,
        updatedAt: new Date(),
      });
    }

    if (accumulationRows.length > 0) {
      await db.insert(accumulations).values(accumulationRows);
      const itemIds = accumulationRows.map((row) => row.transactionItemId);
      createdAccumulations = (await db
        .select()
        .from(accumulations)
        .where(or(...itemIds.map((id) => eq(accumulations.transactionItemId, id))))) as AccumulationRow[];
    }

    await evaluateCardTier({
      cardId: resolvedCard.cardId,
      campaignId: resolvedCard.baseCampaignId,
      at: now,
    });
  }

  return {
    statusCode: 201,
    transaction: created,
    items: createdItems,
    accumulations: createdAccumulations,
  };
};

const createWebhookHash = (payload: {
  source: string;
  externalEventId?: string;
  userId: string;
  storeId: string;
  cardId?: string;
  items: Array<{ productId: string; quantity?: number; amount?: number; metadata?: string }>;
  metadata?: string;
}) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        source: payload.source,
        externalEventId: payload.externalEventId ?? null,
        userId: payload.userId,
        storeId: payload.storeId,
        cardId: payload.cardId ?? null,
        items: payload.items,
        metadata: payload.metadata ?? null,
      }),
    )
    .digest('hex');

const resolveWebhookSecret = (source: string) => {
  const normalized = source
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  const specificKey = `WEBHOOK_SECRET_${normalized}`;
  return process.env[specificKey] ?? process.env.WEBHOOK_SECRET_DEFAULT ?? null;
};

const toSignature = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest('hex');

const signatureMatches = (provided: string | undefined, expected: string) => {
  if (!provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
};

const toWebhookReceiptPayload = (receipt: WebhookReceiptRow) => ({
  id: receipt.id,
  source: receipt.source,
  hash: receipt.hash,
  externalEventId: receipt.externalEventId ?? undefined,
  transactionId: receipt.transactionId ?? undefined,
  status: receipt.status,
  replayCount: receipt.replayCount,
  error: receipt.error ?? undefined,
  receivedAt: receipt.receivedAt.toISOString(),
  lastReceivedAt: receipt.lastReceivedAt ? receipt.lastReceivedAt.toISOString() : undefined,
  processedAt: receipt.processedAt ? receipt.processedAt.toISOString() : undefined,
});

export const transactionsModule = new Elysia({
  prefix: '/transactions',
  detail: {
    tags: ['Transactions'],
  },
})
  .use(authPlugin)
  .post(
    '/',
    async ({ auth, body, status }: CreateContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      if (isWalletUser(auth) && body.userId !== auth.userId) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No puedes registrar transacciones para otro usuario',
          },
        });
      }

      if (body.items.length === 0) {
        return status(400, {
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'Debes enviar al menos un item',
          },
        });
      }

      const validation = await ensureTransactionEntities(body, status);
      if (validation.error) {
        return validation.error;
      }

      const outcome = await createOrReplayTransaction({
        ...body,
        catalogItems: validation.catalogItems,
      });
      if (!outcome) {
        return status(500, {
          error: {
            code: 'TRANSACTION_CREATE_FAILED',
            message: 'No se pudo crear la transacción',
          },
        });
      }

      return status(outcome.statusCode, {
        data: toDetailPayload(outcome.transaction, outcome.items, outcome.accumulations),
      });
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles, ...walletRoles], allowApiKey: true }),
      headers: authorizationHeader,
      body: transactionCreateRequest,
      response: {
        200: transactionResponse,
        201: transactionResponse,
      },
      detail: {
        summary: 'Registrar transacción',
      },
    },
  )
  .post(
    '/webhook',
    async ({ body, headers, status }: WebhookContext) => {
      if (body.items.length === 0) {
        return status(400, {
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'Debes enviar al menos un item',
          },
        });
      }

      const rawPayload = JSON.stringify(body);
      const secret = resolveWebhookSecret(body.source);
      if (secret) {
        const expected = toSignature(secret, rawPayload);
        const signature = headers['x-webhook-signature'];
        if (!signatureMatches(signature, expected)) {
          return status(401, {
            error: {
              code: 'INVALID_WEBHOOK_SIGNATURE',
              message: 'Firma de webhook inválida',
            },
          });
        }
      }

      const hash = createWebhookHash(body);
      const [existingReceipt] = (await db
        .select({
          id: webhookReceipts.id,
          source: webhookReceipts.source,
          hash: webhookReceipts.hash,
          externalEventId: webhookReceipts.externalEventId,
          transactionId: webhookReceipts.transactionId,
          status: webhookReceipts.status,
          replayCount: webhookReceipts.replayCount,
          error: webhookReceipts.error,
          receivedAt: webhookReceipts.receivedAt,
          lastReceivedAt: webhookReceipts.lastReceivedAt,
          processedAt: webhookReceipts.processedAt,
        })
        .from(webhookReceipts)
        .where(eq(webhookReceipts.hash, hash))) as WebhookReceiptRow[];

      if (existingReceipt?.transactionId) {
        await db
          .update(webhookReceipts)
          .set({
            replayCount: existingReceipt.replayCount + 1,
            lastReceivedAt: new Date(),
          })
          .where(eq(webhookReceipts.id, existingReceipt.id));

        const [existingTx] = (await db
          .select()
          .from(transactions)
          .where(eq(transactions.id, existingReceipt.transactionId))) as TransactionRow[];
        if (existingTx) {
          const existingItems = (await db
            .select()
            .from(transactionItems)
            .where(eq(transactionItems.transactionId, existingTx.id))) as TransactionItemRow[];

          const existingItemIds = existingItems.map((item) => item.id);
          const existingAccumulations =
            existingItemIds.length > 0
              ? ((await db
                  .select()
                  .from(accumulations)
                  .where(
                    or(...existingItemIds.map((id) => eq(accumulations.transactionItemId, id))),
                  )) as AccumulationRow[])
              : [];

          return status(200, {
            data: toDetailPayload(existingTx, existingItems, existingAccumulations),
            meta: {
              replayed: true,
              hash: existingReceipt.hash,
              externalEventId: existingReceipt.externalEventId ?? undefined,
            },
          });
        }
      }

      if (existingReceipt && !existingReceipt.transactionId) {
        await db
          .update(webhookReceipts)
          .set({
            replayCount: existingReceipt.replayCount + 1,
            lastReceivedAt: new Date(),
          })
          .where(eq(webhookReceipts.id, existingReceipt.id));

        return status(409, {
          error: {
            code: 'WEBHOOK_ALREADY_REJECTED',
            message: 'El webhook ya fue rechazado previamente para este hash',
          },
        });
      }

      const validation = await ensureTransactionEntities(body, status);
      if (validation.error) {
        await db.insert(webhookReceipts).values({
          source: body.source,
          hash,
          externalEventId: body.externalEventId ?? null,
          payload: rawPayload,
          status: 'error',
          error: 'VALIDATION_FAILED',
          processedAt: new Date(),
        });

        return validation.error;
      }

      const outcome = await createOrReplayTransaction({
        ...body,
        idempotencyKey: hash,
        catalogItems: validation.catalogItems,
      });

      if (!outcome) {
        return status(500, {
          error: {
            code: 'TRANSACTION_CREATE_FAILED',
            message: 'No se pudo crear la transacción',
          },
        });
      }

      await db.insert(webhookReceipts).values({
        source: body.source,
        hash,
        externalEventId: body.externalEventId ?? null,
        transactionId: outcome.transaction.id,
        payload: rawPayload,
        status: 'processed',
        processedAt: new Date(),
      });

      return status(outcome.statusCode, {
        data: toDetailPayload(outcome.transaction, outcome.items, outcome.accumulations),
        meta: {
          replayed: false,
          hash,
          externalEventId: body.externalEventId ?? undefined,
        },
      });
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: webhookHeaderSchema,
      body: transactionWebhookRequest,
      response: {
        200: transactionWebhookResponse,
        201: transactionWebhookResponse,
      },
      detail: {
        summary: 'Ingestar transacción por webhook con idempotencia',
      },
    },
  )
  .get(
    '/webhook-receipts',
    async ({ query, status }: ReceiptListContext) => {
      const cursorDate = parseCursor(query.cursor);
      if (query.cursor && !cursorDate) {
        return status(400, {
          error: {
            code: 'INVALID_CURSOR',
            message: 'Cursor inválido',
          },
        });
      }

      const conditions = [];
      if (query.source) {
        conditions.push(eq(webhookReceipts.source, query.source));
      }
      if (query.status) {
        conditions.push(eq(webhookReceipts.status, query.status));
      }
      if (cursorDate) {
        conditions.push(lt(webhookReceipts.receivedAt, cursorDate));
      }

      let queryBuilder = db.select().from(webhookReceipts);
      if (conditions.length > 0) {
        queryBuilder = queryBuilder.where(and(...conditions));
      }

      const limit = parseLimit(query.limit);
      const rows = (await queryBuilder
        .orderBy(desc(webhookReceipts.receivedAt), desc(webhookReceipts.id))
        .limit(limit + 1)) as WebhookReceiptRow[];

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.receivedAt.toISOString() : null;

      return {
        data: items.map(toWebhookReceiptPayload),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      query: webhookReceiptListQuery,
      response: {
        200: webhookReceiptListResponse,
      },
      detail: {
        summary: 'Listar recibos de webhooks de transacciones',
      },
    },
  )
  .get(
    '/webhook-metrics',
    async ({ query, status }: MetricsContext) => {
      const fromDate = query.from ? new Date(query.from) : null;
      const toDate = query.to ? new Date(query.to) : null;
      if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
        return status(400, {
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'Rango de fechas inválido',
          },
        });
      }

      const conditions = [];
      if (query.source) {
        conditions.push(eq(webhookReceipts.source, query.source));
      }
      if (fromDate) {
        conditions.push(gt(webhookReceipts.receivedAt, fromDate));
      }
      if (toDate) {
        conditions.push(lt(webhookReceipts.receivedAt, toDate));
      }

      let metricsQuery = db
        .select({
          totalReceived: sql<number>`count(*)::int`,
          processed: sql<number>`sum(case when ${webhookReceipts.status} = 'processed' then 1 else 0 end)::int`,
          replayed: sql<number>`sum(${webhookReceipts.replayCount})::int`,
          errors: sql<number>`sum(case when ${webhookReceipts.status} = 'error' then 1 else 0 end)::int`,
        })
        .from(webhookReceipts);

      if (conditions.length > 0) {
        metricsQuery = metricsQuery.where(and(...conditions));
      }

      const [metrics] = (await metricsQuery) as Array<{
        totalReceived: number | null;
        processed: number | null;
        replayed: number | null;
        errors: number | null;
      }>;

      return {
        data: {
          totalReceived: metrics?.totalReceived ?? 0,
          processed: metrics?.processed ?? 0,
          replayed: metrics?.replayed ?? 0,
          errors: metrics?.errors ?? 0,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authorizationHeader,
      query: webhookMetricsQuery,
      response: {
        200: webhookMetricsResponse,
      },
      detail: {
        summary: 'Métricas de ingestión webhook de transacciones',
      },
    },
  )
  .get(
    '/',
    async ({ auth, query, status }: ListContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const cursorDate = parseCursor(query.cursor);
      if (query.cursor && !cursorDate) {
        return status(400, {
          error: {
            code: 'INVALID_CURSOR',
            message: 'Cursor inválido',
          },
        });
      }

      const fromDate = query.from ? new Date(query.from) : null;
      const toDate = query.to ? new Date(query.to) : null;
      if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
        return status(400, {
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'Rango de fechas inválido',
          },
        });
      }

      const conditions = [];
      const enforcedUserId = isWalletUser(auth) ? auth.userId : query.userId;
      if (enforcedUserId) {
        conditions.push(eq(transactions.userId, enforcedUserId));
      }
      if (query.storeId) {
        conditions.push(eq(transactions.storeId, query.storeId));
      }
      if (query.cardId) {
        conditions.push(eq(transactions.cardId, query.cardId));
      }
      if (query.q) {
        const qPattern = `%${query.q}%`;
        conditions.push(
          or(
            sql`cast(${transactions.id} as text) ilike ${qPattern}`,
            sql`cast(${transactions.userId} as text) ilike ${qPattern}`,
            sql`cast(${transactions.storeId} as text) ilike ${qPattern}`,
            sql`cast(${transactions.cardId} as text) ilike ${qPattern}`,
          ),
        );
      }
      if (fromDate) {
        conditions.push(gt(transactions.createdAt, fromDate));
      }
      if (toDate) {
        conditions.push(lt(transactions.createdAt, toDate));
      }
      if (cursorDate) {
        conditions.push(lt(transactions.createdAt, cursorDate));
      }

      let queryBuilder = db.select().from(transactions);
      if (conditions.length > 0) {
        queryBuilder = queryBuilder.where(and(...conditions));
      }

      const limit = parseLimit(query.limit);
      const rows = (await queryBuilder
        .orderBy(desc(transactions.createdAt), desc(transactions.id))
        .limit(limit + 1)) as TransactionRow[];

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : null;

      const txIds = items.map((tx) => tx.id);
      const listItems =
        txIds.length > 0
          ? ((await db
              .select()
              .from(transactionItems)
              .where(or(...txIds.map((id) => eq(transactionItems.transactionId, id))))) as TransactionItemRow[])
          : [];

      const groupedItems = buildItemsMap(listItems);

      return {
        data: items.map((tx) => toListPayload(tx, groupedItems.get(tx.id) ?? [])),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles, ...walletRoles], allowApiKey: true }),
      headers: authorizationHeader,
      query: transactionListQuery,
      response: {
        200: transactionListResponse,
      },
      detail: {
        summary: 'Listar transacciones',
      },
    },
  )
  .get(
    '/:transactionId',
    async ({ auth, params, status }: ParamsContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const [tx] = (await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, params.transactionId))) as TransactionRow[];
      if (!tx) {
        return status(404, {
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: 'Transacción no encontrada',
          },
        });
      }

      if (isWalletUser(auth) && tx.userId !== auth.userId) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes permiso para consultar esta transacción',
          },
        });
      }

      const items = (await db
        .select()
        .from(transactionItems)
        .where(eq(transactionItems.transactionId, tx.id))) as TransactionItemRow[];

      const txAccumulations =
        items.length > 0
          ? ((await db
              .select()
              .from(accumulations)
              .where(or(...items.map((item) => eq(accumulations.transactionItemId, item.id))))) as AccumulationRow[])
          : [];

      return {
        data: toDetailPayload(tx, items, txAccumulations),
      };
    },
    {
      beforeHandle: authGuard({ roles: [...allowedRoles, ...walletRoles], allowApiKey: true }),
      headers: authorizationHeader,
      response: {
        200: transactionDetailResponse,
      },
      detail: {
        summary: 'Obtener transacción',
      },
    },
  );
