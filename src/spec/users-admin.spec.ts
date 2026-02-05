import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { db } from '../db/client';
import { users } from '../db/schema';

const app = createApp();

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

    const response = await app.handle(
      new Request('http://localhost/v1/users', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          email,
          phone,
          role: 'store_staff',
          name: 'Staff Test',
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.temporaryPassword).toBeTruthy();
    expect(payload.data.role).toBe('store_staff');

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

    const blockResponse = await app.handle(
      new Request(`http://localhost/v1/users/${created.id}/block`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          until: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          reason: 'Fraude sospechado',
        }),
      }),
    );

    expect(blockResponse.status).toBe(200);
    const blockPayload = await blockResponse.json();
    expect(blockPayload.data.blockedUntil).toBeTruthy();

    const unblockResponse = await app.handle(
      new Request(`http://localhost/v1/users/${created.id}/unblock`, {
        method: 'POST',
        headers: adminHeaders,
      }),
    );

    expect(unblockResponse.status).toBe(200);
    const unblockPayload = await unblockResponse.json();
    expect(unblockPayload.data.status).toBe('active');

    await cleanupUser(email, phone);
  });
});
