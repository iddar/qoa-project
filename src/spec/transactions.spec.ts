import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { stores, transactions, users } from '../db/schema';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';

const app = createApp();
const api = treaty<App>(app);

const adminHeaders = {
  authorization: 'Bearer dev-token',
  'x-dev-user-id': 'dev-admin',
  'x-dev-user-role': 'qoa_admin',
};

const createUser = async () => {
  const phone = `+52155${Math.floor(Math.random() * 10_000_000)
    .toString()
    .padStart(7, '0')}`;
  const email = `tx_${crypto.randomUUID()}@qoa.test`;

  const [created] = (await db
    .insert(users)
    .values({
      phone,
      email,
      role: 'consumer',
    })
    .returning({ id: users.id })) as Array<{ id: string }>;

  if (!created) {
    throw new Error('Failed to create test user');
  }

  return created;
};

const createStore = async () => {
  const [created] = (await db
    .insert(stores)
    .values({
      name: 'Store TX',
      code: `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      type: 'tiendita',
    })
    .returning({ id: stores.id })) as Array<{ id: string }>;

  if (!created) {
    throw new Error('Failed to create test store');
  }

  return created;
};

describe('Transactions module', () => {
  it('creates and retrieves transaction details', async () => {
    const user = await createUser();
    const store = await createStore();

    const idempotencyKey = `tx-key-${crypto.randomUUID()}`;

    const {
      data: created,
      error: createError,
      status: createStatus,
    } = await api.v1.transactions.post(
      {
        userId: user.id,
        storeId: store.id,
        idempotencyKey,
        items: [
          {
            productId: 'sku-001',
            quantity: 2,
            amount: 15,
          },
        ],
      },
      {
        headers: adminHeaders,
      },
    );

    if (createError) {
      throw createError.value;
    }
    if (!created) {
      throw new Error('Transaction response missing');
    }

    expect(createStatus).toBe(201);
    expect(created.data.totalAmount).toBe(30);

    const txId = created.data.id;

    const {
      data: replayed,
      error: replayError,
      status: replayStatus,
    } = await api.v1.transactions.post(
      {
        userId: user.id,
        storeId: store.id,
        idempotencyKey,
        items: [
          {
            productId: 'sku-001',
            quantity: 2,
            amount: 15,
          },
        ],
      },
      {
        headers: adminHeaders,
      },
    );

    if (replayError) {
      throw replayError.value;
    }
    if (!replayed) {
      throw new Error('Replay response missing');
    }

    expect(replayStatus).toBe(200);
    expect(replayed.data.id).toBe(txId);

    const {
      data: listed,
      error: listError,
      status: listStatus,
    } = await api.v1.transactions.get({
      query: {
        userId: user.id,
        limit: '10',
      },
      headers: adminHeaders,
    });

    if (listError) {
      throw listError.value;
    }
    if (!listed) {
      throw new Error('Transaction list missing');
    }

    expect(listStatus).toBe(200);
    expect(listed.data.some((tx: { id: string }) => tx.id === txId)).toBe(true);

    const {
      data: detail,
      error: detailError,
      status: detailStatus,
    } = await api.v1
      .transactions({
        transactionId: txId,
      })
      .get({ headers: adminHeaders });

    if (detailError) {
      throw detailError.value;
    }
    if (!detail) {
      throw new Error('Transaction detail missing');
    }

    expect(detailStatus).toBe(200);
    expect(detail.data.items.length).toBe(1);

    await db.delete(transactions).where(eq(transactions.id, txId));
    await db.delete(stores).where(eq(stores.id, store.id));
    await db.delete(users).where(eq(users.id, user.id));
  });
});
