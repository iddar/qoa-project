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
  const phone = `+52155${Math.floor(Math.random() * 1_000_0000).toString().padStart(7, '0')}`;
  const email = `store_${crypto.randomUUID()}@qoa.test`;

  const [created] = await db
    .insert(users)
    .values({
      phone,
      email,
      role: 'consumer',
    })
    .returning({ id: users.id, email: users.email, phone: users.phone });

  if (!created) {
    throw new Error('Failed to create test user');
  }

  return created;
};

const buildAuthHeaders = (userId: string) => ({
  'x-dev-user-id': userId,
  'x-dev-user-role': 'consumer',
});

describe('Stores module', () => {
  it('creates, fetches, and returns QR payload for stores', async () => {
    const user = await createUser();
    const authHeaders = buildAuthHeaders(user.id);

    const { data: created, error: createError, status: createStatus } = await api.v1.stores.post({
      name: 'Tienda Central',
      type: 'tiendita',
      address: 'Calle 123',
      $headers: authHeaders,
    });

    if (createError) {
      throw createError.value;
    }

    if (!created) {
      throw new Error('Store response missing');
    }

    expect(createStatus).toBe(201);
    expect(created.data.code).toContain('sto_');

    const storeId = created.data.id;

    const { data: fetched, error: fetchError, status: fetchStatus } = await api.v1.stores({ storeId }).get({
      $headers: authHeaders,
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
      $headers: authHeaders,
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
