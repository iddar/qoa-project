import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { cards, stores, transactions, users } from '../db/schema';

const app = createApp();
const api = treaty<App>(app);

const adminHeaders = {
  'content-type': 'application/json',
  'x-dev-user-id': 'dev-admin',
  'x-dev-user-role': 'qoa_admin',
};

const supportHeaders = {
  'content-type': 'application/json',
  'x-dev-user-id': 'dev-support',
  'x-dev-user-role': 'qoa_support',
};

const cleanupUser = async (email: string | null, phone: string) => {
  if (email) {
    await db.delete(users).where(eq(users.email, email));
  }
  await db.delete(users).where(eq(users.phone, phone));
};

describe('Backoffice user management', () => {
  it('lists users with basic data for backoffice', async () => {
    process.env.AUTH_DEV_MODE = 'true';

    const email = `list_${crypto.randomUUID()}@qoa.test`;
    const phone = `+52155${Math.floor(Math.random() * 1_000_0000)
      .toString()
      .padStart(7, '0')}`;

    const [created] = (await db
      .insert(users)
      .values({
        email,
        phone,
        passwordHash: await Bun.password.hash('Password123!'),
        role: 'consumer',
      })
      .returning({ id: users.id })) as Array<{ id: string }>;

    if (!created) {
      throw new Error('No user created for list test');
    }

    const { data, error, status } = await api.v1.users.get({
      query: {
        limit: 10,
        offset: 0,
      },
      headers: adminHeaders,
    });

    if (error) {
      throw error.value;
    }

    if (!data) {
      throw new Error('List users response missing');
    }

    const found = data.data.find((user: { id: string; role?: string }) => user.id === created.id);
    expect(status).toBe(200);
    expect(found).toBeTruthy();
    expect(found?.role).toBe('consumer');

    await cleanupUser(email, phone);
  });

  it('creates a user with temporary credentials', async () => {
    process.env.AUTH_DEV_MODE = 'true';

    const email = `staff_${crypto.randomUUID()}@qoa.test`;
    const phone = `+52155${Math.floor(Math.random() * 1_000_0000)
      .toString()
      .padStart(7, '0')}`;

    const { data, error, status } = await api.v1.users.post(
      {
        email,
        phone,
        role: 'store_staff',
        name: 'Staff Test',
        tenantId: crypto.randomUUID(),
        tenantType: 'store',
      },
      { headers: adminHeaders },
    );

    if (error) {
      throw error.value;
    }

    if (!data) {
      throw new Error('Admin create user response missing');
    }

    expect(status).toBe(200);
    expect(data.data.temporaryPassword).toBeTruthy();
    expect(data.data.role).toBe('store_staff');

    await cleanupUser(email, phone);
  });

  it('blocks and unblocks a user', async () => {
    process.env.AUTH_DEV_MODE = 'true';

    const email = `block_${crypto.randomUUID()}@qoa.test`;
    const phone = `+52155${Math.floor(Math.random() * 1_000_0000)
      .toString()
      .padStart(7, '0')}`;

    const [created] = (await db
      .insert(users)
      .values({
        email,
        phone,
        passwordHash: await Bun.password.hash('Password123!'),
        role: 'consumer',
      })
      .returning({ id: users.id })) as Array<{ id: string }>;

    if (!created) {
      throw new Error('No user created for block test');
    }

    const {
      data: blockData,
      error: blockError,
      status: blockStatus,
    } = await api.v1.users({ id: created.id }).block.post(
      {
        until: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        reason: 'Fraude sospechado',
      },
      { headers: adminHeaders },
    );

    if (blockError) {
      throw blockError.value;
    }

    if (!blockData) {
      throw new Error('Block user response missing');
    }

    expect(blockStatus).toBe(200);
    expect(blockData.data.blockedUntil).toBeTruthy();

    const {
      data: unblockData,
      error: unblockError,
      status: unblockStatus,
    } = await api.v1.users({ id: created.id }).unblock.post(undefined, { headers: adminHeaders });

    if (unblockError) {
      throw unblockError.value;
    }

    if (!unblockData) {
      throw new Error('Unblock user response missing');
    }

    expect(unblockStatus).toBe(200);
    expect(unblockData.data.status).toBe('active');

    await cleanupUser(email, phone);
  });

  it('deletes a test user and cascades wallet movements for qoa_admin', async () => {
    process.env.AUTH_DEV_MODE = 'true';

    const email = `delete_${crypto.randomUUID()}@qoa.test`;
    const phone = `+52155${Math.floor(Math.random() * 1_000_0000)
      .toString()
      .padStart(7, '0')}`;

    const [store] = (await db
      .insert(stores)
      .values({
        name: 'Abarrotes Delete Test',
        code: `DEL_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        type: 'tiendita',
      })
      .returning({ id: stores.id })) as Array<{ id: string }>;

    const [created] = (await db
      .insert(users)
      .values({
        email,
        phone,
        passwordHash: await Bun.password.hash('Password123!'),
        role: 'consumer',
      })
      .returning({ id: users.id })) as Array<{ id: string }>;

    if (!created || !store) {
      throw new Error('No user/store created for delete test');
    }

    const [card] = (await db
      .insert(cards)
      .values({
        userId: created.id,
        campaignId: crypto.randomUUID(),
        storeId: store.id,
        code: `DEL${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      })
      .returning({ id: cards.id })) as Array<{ id: string }>;

    await db.insert(transactions).values({
      userId: created.id,
      storeId: store.id,
      cardId: card?.id,
      idempotencyKey: `delete-user-${crypto.randomUUID()}`,
      totalAmount: 42,
    });

    const { data, error, status } = await api.v1.users({ id: created.id }).delete(undefined, { headers: adminHeaders });

    if (error) {
      throw error.value;
    }

    expect(status).toBe(200);
    expect(data?.data).toEqual({ id: created.id, deleted: true });

    const remainingUsers = await db.select({ id: users.id }).from(users).where(eq(users.id, created.id));
    const remainingCards = await db.select({ id: cards.id }).from(cards).where(eq(cards.userId, created.id));
    const remainingTransactions = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.userId, created.id));

    expect(remainingUsers).toHaveLength(0);
    expect(remainingCards).toHaveLength(0);
    expect(remainingTransactions).toHaveLength(0);

    await db.delete(stores).where(eq(stores.id, store.id));
  });

  it('rejects user delete when feature flag is disabled or role is not qoa_admin', async () => {
    process.env.AUTH_DEV_MODE = 'true';
    const previousFlag = process.env.BACKOFFICE_USER_DELETE_ENABLED;
    const email = `delete_guard_${crypto.randomUUID()}@qoa.test`;
    const phone = `+52155${Math.floor(Math.random() * 1_000_0000)
      .toString()
      .padStart(7, '0')}`;

    const [created] = (await db
      .insert(users)
      .values({
        email,
        phone,
        passwordHash: await Bun.password.hash('Password123!'),
        role: 'consumer',
      })
      .returning({ id: users.id })) as Array<{ id: string }>;

    if (!created) {
      throw new Error('No user created for delete guard test');
    }

    try {
      process.env.BACKOFFICE_USER_DELETE_ENABLED = 'false';
      const disabled = await api.v1.users({ id: created.id }).delete(undefined, { headers: adminHeaders });
      expect(disabled.status).toBe(403);

      process.env.BACKOFFICE_USER_DELETE_ENABLED = 'true';
      const forbidden = await api.v1.users({ id: created.id }).delete(undefined, { headers: supportHeaders });
      expect(forbidden.status).toBe(403);
    } finally {
      if (previousFlag === undefined) {
        delete process.env.BACKOFFICE_USER_DELETE_ENABLED;
      } else {
        process.env.BACKOFFICE_USER_DELETE_ENABLED = previousFlag;
      }
      await cleanupUser(email, phone);
    }
  });
});
