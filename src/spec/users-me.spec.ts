import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { users } from '../db/schema';

const app = createApp();
const api = treaty<App>(app);

const createConsumer = async () => {
  const email = `me_${crypto.randomUUID()}@qoa.test`;
  const phone = `+52155${Math.floor(Math.random() * 1_000_0000).toString().padStart(7, '0')}`;

  const [created] = (await db
    .insert(users)
    .values({
      email,
      phone,
      name: 'Usuario Inicial',
      passwordHash: await Bun.password.hash('Password123!'),
      role: 'consumer',
    })
    .returning({ id: users.id, email: users.email })) as Array<{ id: string; email: string | null }>;

  if (!created) {
    throw new Error('No user created for /users/me tests');
  }

  return created;
};

const deleteUser = async (id: string) => {
  await db.delete(users).where(eq(users.id, id));
};

describe('Users me endpoint', () => {
  it('returns current user profile', async () => {
    process.env.AUTH_DEV_MODE = 'true';
    const user = await createConsumer();

    const { data, error, status } = await api.v1.users.me.get({
      headers: {
        'x-dev-user-id': user.id,
        'x-dev-user-role': 'consumer',
      },
    });

    if (error) {
      throw error.value;
    }

    if (!data) {
      throw new Error('GET /users/me data missing');
    }

    expect(status).toBe(200);
    expect(data.data.id).toBe(user.id);
    expect(data.data.role).toBe('consumer');

    await deleteUser(user.id);
  });

  it('returns current user profile with access token', async () => {
    process.env.AUTH_DEV_MODE = 'false';
    const user = await createConsumer();

    const login = await api.v1.auth.login.post({
      email: user.email,
      password: 'Password123!',
    });

    if (login.error) {
      throw login.error.value;
    }

    const accessToken = login.data?.data.accessToken;
    if (!accessToken) {
      throw new Error('Login response missing access token');
    }

    const { data, error, status } = await api.v1.users.me.get({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (error) {
      throw error.value;
    }

    if (!data) {
      throw new Error('GET /users/me data missing');
    }

    expect(status).toBe(200);
    expect(data.data.id).toBe(user.id);
    expect(data.data.role).toBe('consumer');

    await deleteUser(user.id);
  });

  it('updates current user profile', async () => {
    process.env.AUTH_DEV_MODE = 'true';
    const user = await createConsumer();

    const { data, error, status } = await api.v1.users.me.patch(
      {
        name: 'Perfil Actualizado',
        email: `updated_${crypto.randomUUID()}@qoa.test`,
      },
      {
        headers: {
          'content-type': 'application/json',
          'x-dev-user-id': user.id,
          'x-dev-user-role': 'consumer',
        },
      },
    );

    if (error) {
      throw error.value;
    }

    if (!data) {
      throw new Error('PATCH /users/me data missing');
    }

    expect(status).toBe(200);
    expect(data.data.id).toBe(user.id);
    expect(data.data.name).toBe('Perfil Actualizado');
    expect(data.data.email?.startsWith('updated_')).toBe(true);

    await deleteUser(user.id);
  });

  it('rejects email already used by another account', async () => {
    process.env.AUTH_DEV_MODE = 'true';
    const userA = await createConsumer();
    const userB = await createConsumer();

    const { error, status } = await api.v1.users.me.patch(
      {
        email: userB.email ?? undefined,
      },
      {
        headers: {
          'content-type': 'application/json',
          'x-dev-user-id': userA.id,
          'x-dev-user-role': 'consumer',
        },
      },
    );

    if (!error) {
      throw new Error('Expected PATCH /users/me to fail with duplicate email');
    }

    expect(status).toBe(409);
    expect(error.value.error.code).toBe('USER_EXISTS');

    await deleteUser(userA.id);
    await deleteUser(userB.id);
  });
});
