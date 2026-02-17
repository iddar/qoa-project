import { and, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { authGuard, authPlugin } from '../../app/plugins/auth';
import { parseCursor, parseLimit } from '../../app/utils/pagination';
import { db } from '../../db/client';
import { cards, stores, transactionItems, transactions, users, webhookReceipts } from '../../db/schema';
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
  transactionId: string;
  productId: string;
  quantity: number;
  amount: number;
  metadata: string | null;
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

const toDetailPayload = (tx: TransactionRow, items: TransactionItemRow[]) => ({
  ...toListPayload(tx, items),
  accumulations: [],
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

const ensureTransactionEntities = async (
  payload: { userId: string; storeId: string; cardId?: string },
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

  return null;
};

const createOrReplayTransaction = async (payload: {
  userId: string;
  storeId: string;
  cardId?: string;
  metadata?: string;
  idempotencyKey?: string;
  items: Array<{ productId: string; quantity?: number; amount?: number; metadata?: string }>;
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

      return {
        statusCode: 200,
        transaction: existing,
        items: existingItems,
      };
    }
  }

  const normalizedItems = normalizeItems(payload.items);
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

  return {
    statusCode: 201,
    transaction: created,
    items: createdItems,
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

      const validationError = await ensureTransactionEntities(body, status);
      if (validationError) {
        return validationError;
      }

      const outcome = await createOrReplayTransaction(body);
      if (!outcome) {
        return status(500, {
          error: {
            code: 'TRANSACTION_CREATE_FAILED',
            message: 'No se pudo crear la transacción',
          },
        });
      }

      return status(outcome.statusCode, {
        data: toDetailPayload(outcome.transaction, outcome.items),
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

          return status(200, {
            data: toDetailPayload(existingTx, existingItems),
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

      const validationError = await ensureTransactionEntities(body, status);
      if (validationError) {
        await db.insert(webhookReceipts).values({
          source: body.source,
          hash,
          externalEventId: body.externalEventId ?? null,
          payload: rawPayload,
          status: 'error',
          error: 'VALIDATION_FAILED',
          processedAt: new Date(),
        });

        return validationError;
      }

      const outcome = await createOrReplayTransaction({
        ...body,
        idempotencyKey: hash,
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
        data: toDetailPayload(outcome.transaction, outcome.items),
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

      return {
        data: toDetailPayload(tx, items),
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
