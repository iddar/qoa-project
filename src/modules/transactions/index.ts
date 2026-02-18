import { and, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { authGuard, authPlugin } from '../../app/plugins/auth';
import { parseCursor, parseLimit } from '../../app/utils/pagination';
import { db } from '../../db/client';
import {
  accumulations,
  balances,
  campaignPolicies,
  cards,
  products,
  stores,
  transactionItems,
  transactions,
  users,
  webhookReceipts,
} from '../../db/schema';
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
const authHeader = t.Object({
  authorization: t.Optional(
    t.String({
      description: 'Bearer <accessToken>',
    }),
  ),
});

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
  params: {
    transactionId: string;
  };
  status: StatusHandler;
};

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
    const [card] = (await db.select({ id: cards.id }).from(cards).where(eq(cards.id, payload.cardId))) as Array<{
      id: string;
    }>;
    if (!card) {
      return status(404, {
        error: {
          code: 'CARD_NOT_FOUND',
          message: 'Tarjeta no encontrada',
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

  const [created] = (await db
    .insert(transactions)
    .values({
      userId: payload.userId,
      storeId: payload.storeId,
      cardId: payload.cardId ?? null,
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
  if (payload.cardId) {
    const [card] = (await db
      .select({
        id: cards.id,
        campaignId: cards.campaignId,
      })
      .from(cards)
      .where(eq(cards.id, payload.cardId))) as Array<{
      id: string;
      campaignId: string;
    }>;

    if (card) {
      const now = new Date();
      const [existingBalance] = (await db.select().from(balances).where(eq(balances.cardId, card.id))) as Array<{
        id: string;
        current: number;
        lifetime: number;
      }>;

      const activePolicies = (await db
        .select()
        .from(campaignPolicies)
        .where(
          and(eq(campaignPolicies.campaignId, card.campaignId), eq(campaignPolicies.active, true)),
        )) as CampaignPolicyRow[];

      let currentBalance = existingBalance?.current ?? 0;
      let lifetimeBalance = existingBalance?.lifetime ?? 0;

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
              .where(and(eq(accumulations.cardId, card.id), gt(accumulations.createdAt, periodStart)))
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
              eq(accumulations.cardId, card.id),
              eq(accumulations.campaignId, card.campaignId),
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

      const accumulationRows = [];
      for (const item of createdItems) {
        const allowed = await canAccumulateItem(item);
        if (!allowed) {
          continue;
        }

        const amount = item.quantity;
        currentBalance += amount;
        lifetimeBalance += amount;
        accumulatedByItem.set(item.productId, (accumulatedByItem.get(item.productId) ?? 0) + amount);
        accumulationRows.push({
          transactionItemId: item.id,
          cardId: card.id,
          campaignId: card.campaignId,
          amount,
          balanceAfter: currentBalance,
          sourceType: 'transaction_item' as const,
          codeCaptureId: null,
        });
      }

      if (existingBalance) {
        await db
          .update(balances)
          .set({
            current: currentBalance,
            lifetime: lifetimeBalance,
            updatedAt: new Date(),
          })
          .where(eq(balances.id, existingBalance.id));
      } else {
        await db.insert(balances).values({
          cardId: card.id,
          current: currentBalance,
          lifetime: lifetimeBalance,
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
    }
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
    async ({ body, status }: CreateContext) => {
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
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authHeader,
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
      headers: authHeader,
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
      headers: authHeader,
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
    async ({ query, status }: ListContext) => {
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
      if (query.userId) {
        conditions.push(eq(transactions.userId, query.userId));
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
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authHeader,
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
    async ({ params, status }: ParamsContext) => {
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
      beforeHandle: authGuard({ roles: [...allowedRoles], allowApiKey: true }),
      headers: authHeader,
      response: {
        200: transactionDetailResponse,
      },
      detail: {
        summary: 'Obtener transacción',
      },
    },
  );
