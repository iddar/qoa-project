import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { balances, campaigns, cards, reminderJobs, stores, users } from '../db/schema';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';

const app = createApp();
const api = treaty<App>(app);

const adminHeaders = {
  authorization: 'Bearer dev-token',
  'x-dev-user-id': 'dev-admin',
  'x-dev-user-role': 'qoa_admin',
};

describe('Jobs module', () => {
  it('queues reminder jobs for eligible cards without duplicates', async () => {
    const [user] = (await db
      .insert(users)
      .values({
        phone: `+52155${Math.floor(Math.random() * 10_000_000)
          .toString()
          .padStart(7, '0')}`,
        email: `jobs_${crypto.randomUUID()}@qoa.test`,
        role: 'consumer',
      })
      .returning({ id: users.id })) as Array<{ id: string }>;

    const [store] = (await db
      .insert(stores)
      .values({
        name: 'Store Jobs',
        code: `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
        type: 'tiendita',
      })
      .returning({ id: stores.id })) as Array<{ id: string }>;

    const [campaign] = (await db
      .insert(campaigns)
      .values({
        name: `Campaign Jobs ${crypto.randomUUID().slice(0, 6)}`,
        status: 'active',
      })
      .returning({ id: campaigns.id })) as Array<{ id: string }>;

    const [card] = (await db
      .insert(cards)
      .values({
        userId: user!.id,
        campaignId: campaign!.id,
        storeId: store!.id,
        code: `card_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      })
      .returning({ id: cards.id })) as Array<{ id: string }>;

    await db.insert(balances).values({
      cardId: card!.id,
      current: 10,
      lifetime: 10,
      updatedAt: new Date(),
    });

    const runOne = await api.v1.jobs.reminders.run.post(
      {
        limit: 100,
      },
      {
        headers: adminHeaders,
      },
    );

    if (runOne.error) {
      throw runOne.error.value;
    }
    if (!runOne.data) {
      throw new Error('Run reminders response missing');
    }

    expect(runOne.status).toBe(200);
    expect(runOne.data.data.queued).toBeGreaterThanOrEqual(1);

    const runTwo = await api.v1.jobs.reminders.run.post(
      {
        limit: 100,
      },
      {
        headers: adminHeaders,
      },
    );

    if (runTwo.error) {
      throw runTwo.error.value;
    }
    if (!runTwo.data) {
      throw new Error('Second run reminders response missing');
    }

    expect(runTwo.status).toBe(200);
    expect(runTwo.data.data.queued).toBe(0);

    const listed = await api.v1.jobs.reminders.get({
      query: {
        limit: '10',
      },
      headers: adminHeaders,
    });

    if (listed.error) {
      throw listed.error.value;
    }
    if (!listed.data) {
      throw new Error('List reminders response missing');
    }

    expect(listed.status).toBe(200);
    expect(listed.data.data.some((job: { cardId: string }) => job.cardId === card!.id)).toBe(true);

    const tiersRun = await api.v1.jobs.tiers.run.post(
      {
        limit: 100,
      },
      {
        headers: adminHeaders,
      },
    );

    if (tiersRun.error) {
      throw tiersRun.error.value;
    }
    if (!tiersRun.data) {
      throw new Error('Run tiers response missing');
    }

    expect(tiersRun.status).toBe(200);
    expect(tiersRun.data.data.checked).toBeGreaterThanOrEqual(1);

    await db.delete(reminderJobs).where(eq(reminderJobs.cardId, card!.id));
    await db.delete(balances).where(eq(balances.cardId, card!.id));
    await db.delete(cards).where(eq(cards.id, card!.id));
    await db.delete(campaigns).where(eq(campaigns.id, campaign!.id));
    await db.delete(stores).where(eq(stores.id, store!.id));
    await db.delete(users).where(eq(users.id, user!.id));
  });
});
