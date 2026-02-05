import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { users } from '../db/schema';

const app = createApp();
const api = treaty<App>(app);

const adminHeaders = {
  'content-type': 'application/json',
  'x-dev-user-id': 'dev-admin',
  'x-dev-user-role': 'qoa_admin',
};

const cleanupUser = async (email: string | null, phone: string) => {
  if (email) {
    await db.delete(users).where(eq(users.email, email));
  }
  await db.delete(users).where(eq(users.phone, phone));
};

describe('Backoffice user management', () => {
  it('creates a user with temporary credentials', async () => {
    process.env.AUTH_DEV_MODE = 'true';

    const email = `staff_${crypto.randomUUID()}@qoa.test`;
    const phone = `+52155${Math.floor(Math.random() * 1_000_0000).toString().padStart(7, '0')}`;

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
    const phone = `+52155${Math.floor(Math.random() * 1_000_0000).toString().padStart(7, '0')}`;

    const [created] = await db
      .insert(users)
      .values({
        email,
        phone,
        passwordHash: await Bun.password.hash('Password123!'),
        role: 'consumer',
      })
      .returning({ id: users.id });

    if (!created) {
      throw new Error('No user created for block test');
    }

    const { data: blockData, error: blockError, status: blockStatus } = await api.v1.users(
      { id: created.id },
    ).block.post(
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

    const { data: unblockData, error: unblockError, status: unblockStatus } = await api.v1.users(
      { id: created.id },
    ).unblock.post(undefined, { headers: adminHeaders });

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
});
