import { and, desc, eq, gt, lt, or } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { createHash } from 'node:crypto';
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
  status: StatusHandler;
};

type WebhookReceiptRow = {
  id: string;
  hash: string;
  externalEventId: string | null;
  transactionId: string | null;
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
    async ({ body, status }: WebhookContext) => {
      if (body.items.length === 0) {
        return status(400, {
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'Debes enviar al menos un item',
          },
        });
      }

      const hash = createWebhookHash(body);
      const [existingReceipt] = (await db
        .select({
          id: webhookReceipts.id,
          hash: webhookReceipts.hash,
          externalEventId: webhookReceipts.externalEventId,
          transactionId: webhookReceipts.transactionId,
        })
        .from(webhookReceipts)
        .where(eq(webhookReceipts.hash, hash))) as WebhookReceiptRow[];

      if (existingReceipt?.transactionId) {
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

      const validationError = await ensureTransactionEntities(body, status);
      if (validationError) {
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
        payload: JSON.stringify(body),
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
      headers: authHeader,
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
