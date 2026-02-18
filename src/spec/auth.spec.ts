import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { campaignSubscriptions, campaigns, cards, users } from '../db/schema';
import { UNIVERSAL_CAMPAIGN_KEY } from '../services/wallet-onboarding';

const app = createApp();
const api = treaty<App>(app);

const cleanupUser = async (email: string | null, phone: string) => {
  if (email) {
    await db.delete(users).where(eq(users.email, email));
  }
  await db.delete(users).where(eq(users.phone, phone));
};

describe('Auth signup/login', () => {
  it('allows consumer signup and returns tokens', async () => {
    const email = `consumer_${crypto.randomUUID()}@qoa.test`;
    const phone = `+52155${Math.floor(Math.random() * 1_000_0000)
      .toString()
      .padStart(7, '0')}`;

    const { data, error, status } = await api.v1.auth.signup.post({
      email,
      phone,
      password: 'Password123!',
      role: 'consumer',
    });

    if (error) {
      throw error.value;
    }

    if (!data) {
      throw new Error('Signup response data missing');
    }

    expect(status).toBe(200);
    expect(data.data.accessToken).toBeTruthy();
    expect(data.data.refreshToken).toBeTruthy();
    expect(data.data.user.email).toBe(email);

    const [universalCampaign] = (await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.key, UNIVERSAL_CAMPAIGN_KEY))) as Array<{ id: string }>;
    if (!universalCampaign) {
      throw new Error('Universal campaign missing after signup');
    }

    const [createdCard] = (await db
      .select({ id: cards.id, campaignId: cards.campaignId })
      .from(cards)
      .where(eq(cards.userId, data.data.user.id))) as Array<{ id: string; campaignId: string }>;

    expect(createdCard?.campaignId).toBe(universalCampaign.id);

    const [subscription] = (await db
      .select({ status: campaignSubscriptions.status })
      .from(campaignSubscriptions)
      .where(eq(campaignSubscriptions.userId, data.data.user.id))) as Array<{ status: string }>;

    expect(subscription?.status).toBe('subscribed');

    await cleanupUser(email, phone);
  });

  it('prevents signup with duplicate email', async () => {
    const email = `dup_${crypto.randomUUID()}@qoa.test`;
    const phone = `+52155${Math.floor(Math.random() * 1_000_0000)
      .toString()
      .padStart(7, '0')}`;

    await db.insert(users).values({
      email,
      phone,
      passwordHash: await Bun.password.hash('Password123!'),
      role: 'consumer',
    });

    const { error, status } = await api.v1.auth.signup.post({
      email,
      phone: `+52155${Math.floor(Math.random() * 1_000_0000)
        .toString()
        .padStart(7, '0')}`,
      password: 'Password123!',
      role: 'consumer',
    });

    if (!error) {
      throw new Error('Expected signup to fail with duplicate email');
    }

    expect(status).toBe(409);
    expect(error.value.error.code).toBe('USER_EXISTS');

    await cleanupUser(email, phone);
  });

  it('blocks login for temporarily blocked users', async () => {
    const email = `blocked_${crypto.randomUUID()}@qoa.test`;
    const phone = `+52155${Math.floor(Math.random() * 1_000_0000)
      .toString()
      .padStart(7, '0')}`;
    const password = 'Password123!';

    await db.insert(users).values({
      email,
      phone,
      passwordHash: await Bun.password.hash(password),
      role: 'consumer',
      blockedUntil: new Date(Date.now() + 60 * 60 * 1000),
    });

    const { error, status } = await api.v1.auth.login.post({
      email,
      password,
    });

    if (!error) {
      throw new Error('Expected blocked user login to fail');
    }

    expect(status).toBe(403);
    expect(error.value.error.code).toBe('ACCOUNT_BLOCKED');

    await cleanupUser(email, phone);
  });

  it('provisions universal card for existing consumer on login', async () => {
    const email = `existing_${crypto.randomUUID()}@qoa.test`;
    const phone = `+52155${Math.floor(Math.random() * 1_000_0000)
      .toString()
      .padStart(7, '0')}`;
    const password = 'Password123!';

    const [createdUser] = (await db
      .insert(users)
      .values({
        email,
        phone,
        passwordHash: await Bun.password.hash(password),
        role: 'consumer',
      })
      .returning({ id: users.id })) as Array<{ id: string }>;

    if (!createdUser) {
      throw new Error('Failed to create user for login onboarding test');
    }

    const [beforeCard] = (await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.userId, createdUser.id))) as Array<{ id: string }>;

    expect(beforeCard).toBeUndefined();

    const { data, error, status } = await api.v1.auth.login.post({
      email,
      password,
    });

    if (error) {
      throw error.value;
    }

    if (!data) {
      throw new Error('Login response missing');
    }

    expect(status).toBe(200);

    const [universalCampaign] = (await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.key, UNIVERSAL_CAMPAIGN_KEY))) as Array<{ id: string }>;

    const [createdCard] = (await db
      .select({ id: cards.id, campaignId: cards.campaignId })
      .from(cards)
      .where(eq(cards.userId, createdUser.id))) as Array<{ id: string; campaignId: string }>;

    expect(universalCampaign?.id).toBeTruthy();
    expect(createdCard?.campaignId).toBe(universalCampaign?.id);

    const [subscription] = (await db
      .select({ status: campaignSubscriptions.status })
      .from(campaignSubscriptions)
      .where(eq(campaignSubscriptions.userId, createdUser.id))) as Array<{ status: string }>;

    expect(subscription?.status).toBe('subscribed');

    await cleanupUser(email, phone);
  });
});
