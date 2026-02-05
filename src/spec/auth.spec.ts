import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { db } from '../db/client';
import { users } from '../db/schema';

const app = createApp();

const cleanupUser = async (email: string | null, phone: string) => {
  if (email) {
    await db.delete(users).where(eq(users.email, email));
  }
  await db.delete(users).where(eq(users.phone, phone));
};

describe('Auth signup/login', () => {
  it('allows consumer signup and returns tokens', async () => {
    const email = `consumer_${crypto.randomUUID()}@qoa.test`;
    const phone = `+52155${Math.floor(Math.random() * 1_000_0000).toString().padStart(7, '0')}`;

    const response = await app.handle(
      new Request('http://localhost/v1/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          phone,
          password: 'Password123!',
          role: 'consumer',
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.accessToken).toBeTruthy();
    expect(payload.data.refreshToken).toBeTruthy();
    expect(payload.data.user.email).toBe(email);

    await cleanupUser(email, phone);
  });

  it('prevents signup with duplicate email', async () => {
    const email = `dup_${crypto.randomUUID()}@qoa.test`;
    const phone = `+52155${Math.floor(Math.random() * 1_000_0000).toString().padStart(7, '0')}`;

    await db.insert(users).values({
      email,
      phone,
      passwordHash: await Bun.password.hash('Password123!'),
      role: 'consumer',
    });

    const response = await app.handle(
      new Request('http://localhost/v1/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          phone: `+52155${Math.floor(Math.random() * 1_000_0000).toString().padStart(7, '0')}`,
          password: 'Password123!',
          role: 'consumer',
        }),
      }),
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.error.code).toBe('USER_EXISTS');

    await cleanupUser(email, phone);
  });

  it('blocks login for temporarily blocked users', async () => {
    const email = `blocked_${crypto.randomUUID()}@qoa.test`;
    const phone = `+52155${Math.floor(Math.random() * 1_000_0000).toString().padStart(7, '0')}`;
    const password = 'Password123!';

    await db.insert(users).values({
      email,
      phone,
      passwordHash: await Bun.password.hash(password),
      role: 'consumer',
      blockedUntil: new Date(Date.now() + 60 * 60 * 1000),
    });

    const response = await app.handle(
      new Request('http://localhost/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
        }),
      }),
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error.code).toBe('ACCOUNT_BLOCKED');

    await cleanupUser(email, phone);
  });
});
