import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { stores, users } from '../db/schema';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';

const app = createApp();
const api = treaty<App>(app);

const createUser = async () => {
  const phone = `+52155${Math.floor(Math.random() * 10_000_000).toString().padStart(7, '0')}`;
  const email = `store_${crypto.randomUUID()}@qoa.test`;
  const password = 'Password123!';

  const [created] = (await db
    .insert(users)
    .values({
      phone,
      email,
      passwordHash: await Bun.password.hash(password),
      role: 'consumer',
    })
    .returning({ id: users.id, email: users.email, phone: users.phone })) as Array<{
    id: string;
    email: string | null;
    phone: string;
  }>;

  if (!created) {
    throw new Error('Failed to create test user');
  }

  if (!created.email) {
    throw new Error('Failed to create test user email');
  }

  return {
    ...created,
    email: created.email,
    password,
  };
};

const buildAuthHeaders = (accessToken: string) => ({
  authorization: `Bearer ${accessToken}`,
});

describe('Stores module', () => {
  it('creates, fetches, and returns QR payload for stores', async () => {
    const user = await createUser();
    const { data: loginData, error: loginError, status: loginStatus } = await api.v1.auth.login.post({
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

    const { data: created, error: createError, status: createStatus } = await api.v1.stores.post(
      {
        name: 'Tienda Central',
        type: 'tiendita',
        address: 'Calle 123',
      },
      {
        headers: authHeaders,
      },
    );

    if (createError) {
      throw createError.value;
    }

    if (!created) {
      throw new Error('Store response missing');
    }

    expect(createStatus).toBe(201);
    expect(created.data.code).toContain('sto_');

    const storeId = created.data.id;

    const { data: listed, error: listError, status: listStatus } = await api.v1.stores.get({
      query: {
        limit: '20',
      },
      headers: authHeaders,
    });

    if (listError) {
      throw listError.value;
    }

    if (!listed) {
      throw new Error('Store list missing');
    }

    expect(listStatus).toBe(200);
    expect(listed.data.some((store: { id: string }) => store.id === storeId)).toBe(true);

    const { data: fetched, error: fetchError, status: fetchStatus } = await api.v1.stores({ storeId }).get({
      headers: authHeaders,
    });

    if (fetchError) {
      throw fetchError.value;
    }

    if (!fetched) {
      throw new Error('Store fetch missing');
    }

    expect(fetchStatus).toBe(200);
    expect(fetched.data.id).toBe(storeId);

    const { data: qrData, error: qrError, status: qrStatus } = await api.v1.stores({ storeId }).qr.get({
      headers: authHeaders,
    });

    if (qrError) {
      throw qrError.value;
    }

    if (!qrData) {
      throw new Error('QR payload missing');
    }

    expect(qrStatus).toBe(200);
    expect(qrData.data.payload.entityType).toBe('store');
    expect(qrData.data.payload.entityId).toBe(storeId);
    expect(qrData.data.code).toBe(created.data.code);

    await db.delete(stores).where(eq(stores.id, storeId));
    await db.delete(users).where(eq(users.id, user.id));
  });
});
