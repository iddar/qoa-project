import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { cards, stores, users } from '../db/schema';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';

const app = createApp();
const api = treaty<App>(app);

const createUser = async () => {
  const phone = `+52155${Math.floor(Math.random() * 10_000_000)
    .toString()
    .padStart(7, '0')}`;
  const email = `card_${crypto.randomUUID()}@qoa.test`;
  const password = 'Password123!';

  const [created] = (await db
    .insert(users)
    .values({
      phone,
      email,
      passwordHash: await Bun.password.hash(password),
      role: 'consumer',
    })
    .returning({ id: users.id, email: users.email })) as Array<{ id: string; email: string | null }>;

  if (!created) {
    throw new Error('Failed to create test user');
  }

  if (!created.email) {
    throw new Error('Test user email missing');
  }

  return {
    id: created.id,
    email: created.email,
    password,
  };
};

const createStore = async () => {
  const [created] = (await db
    .insert(stores)
    .values({
      name: 'Tienda Norte',
      code: `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      type: 'minisuper',
    })
    .returning({ id: stores.id })) as Array<{ id: string }>;

  if (!created) {
    throw new Error('Failed to create test store');
  }

  return created;
};

const buildAuthHeaders = (accessToken: string) => ({
  authorization: `Bearer ${accessToken}`,
});

describe('Cards module', () => {
  it('creates cards, fetches QR payload, and lists user cards', async () => {
    const user = await createUser();
    const store = await createStore();
    const {
      data: loginData,
      error: loginError,
      status: loginStatus,
    } = await api.v1.auth.login.post({
      email: user.email,
      password: user.password,
    });

    if (loginError) {
      throw loginError.value;
    }

    if (!loginData) {
      throw new Error('Login response missing');
    }

    expect(loginStatus).toBe(200);
    const authHeaders = buildAuthHeaders(loginData.data.accessToken);

    const {
      data: created,
      error: createError,
      status: createStatus,
    } = await api.v1.cards.post(
      {
        userId: user.id,
        campaignId: crypto.randomUUID(),
        storeId: store.id,
      },
      {
        headers: authHeaders,
      },
    );

    if (createError) {
      throw createError.value;
    }

    if (!created) {
      throw new Error('Card response missing');
    }

    expect(createStatus).toBe(201);
    expect(created.data.code).toContain('card_');

    const cardId = created.data.id;

    const {
      data: fetched,
      error: fetchError,
      status: fetchStatus,
    } = await api.v1.cards({ cardId }).get({
      headers: authHeaders,
    });

    if (fetchError) {
      throw fetchError.value;
    }

    if (!fetched) {
      throw new Error('Card fetch missing');
    }

    expect(fetchStatus).toBe(200);
    expect(fetched.data.id).toBe(cardId);

    const {
      data: qrData,
      error: qrError,
      status: qrStatus,
    } = await api.v1.cards({ cardId }).qr.get({
      headers: authHeaders,
    });

    if (qrError) {
      throw qrError.value;
    }

    if (!qrData) {
      throw new Error('Card QR payload missing');
    }

    expect(qrStatus).toBe(200);
    expect(qrData.data.payload.entityType).toBe('card');
    expect(qrData.data.payload.entityId).toBe(cardId);

    const {
      data: listData,
      error: listError,
      status: listStatus,
    } = await api.v1.users.me.cards.get({
      headers: authHeaders,
    });

    if (listError) {
      throw listError.value;
    }

    if (!listData) {
      throw new Error('Card list missing');
    }

    expect(listStatus).toBe(200);
    expect(listData.data.some((card: { id: string }) => card.id === cardId)).toBe(true);

    await db.delete(stores).where(eq(stores.id, store.id));
    await db.delete(users).where(eq(users.id, user.id));
  });
});
