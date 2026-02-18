import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { balances, campaignBalances, campaigns, cards, cpgs, redemptions, rewards, stores, users } from '../db/schema';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';

const app = createApp();
const api = treaty<App>(app);

const adminHeaders = {
  authorization: 'Bearer dev-token',
  'x-dev-user-id': 'dev-admin',
  'x-dev-user-role': 'qoa_admin',
};

describe('Rewards module', () => {
  it('creates, lists and redeems rewards', async () => {
    const [user] = (await db
      .insert(users)
      .values({
        phone: `+52155${Math.floor(Math.random() * 10_000_000)
          .toString()
          .padStart(7, '0')}`,
        email: `rewards_${crypto.randomUUID()}@qoa.test`,
        role: 'consumer',
      })
      .returning({ id: users.id })) as Array<{ id: string }>;

    const [store] = (await db
      .insert(stores)
      .values({
        name: 'Store Rewards',
        code: `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
        type: 'tiendita',
      })
      .returning({ id: stores.id })) as Array<{ id: string }>;

    const [campaign] = (await db
      .insert(campaigns)
      .values({
        name: `Campaign Rewards ${crypto.randomUUID().slice(0, 6)}`,
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
      current: 25,
      lifetime: 25,
      updatedAt: new Date(),
    });

    await db.insert(campaignBalances).values({
      cardId: card!.id,
      campaignId: campaign!.id,
      current: 25,
      lifetime: 25,
      updatedAt: new Date(),
    });

    const {
      data: created,
      error: createError,
      status: createStatus,
    } = await api.v1.rewards.post(
      {
        campaignId: campaign!.id,
        name: `Reward ${crypto.randomUUID().slice(0, 5)}`,
        cost: 20,
        stock: 2,
        status: 'active',
      },
      { headers: adminHeaders },
    );

    if (createError) {
      throw createError.value;
    }
    if (!created) {
      throw new Error('Reward create response missing');
    }

    expect(createStatus).toBe(201);

    const rewardId = created.data.id;

    const {
      data: listed,
      error: listError,
      status: listStatus,
    } = await api.v1.rewards.get({
      query: {
        campaignId: campaign!.id,
        available: 'true',
        limit: '20',
      },
      headers: adminHeaders,
    });

    if (listError) {
      throw listError.value;
    }
    if (!listed) {
      throw new Error('Reward list response missing');
    }

    expect(listStatus).toBe(200);
    expect(listed.data.some((reward: { id: string }) => reward.id === rewardId)).toBe(true);

    const {
      data: redeemed,
      error: redeemError,
      status: redeemStatus,
    } = await api.v1.rewards({ rewardId }).redeem.post(
      {
        cardId: card!.id,
      },
      {
        headers: adminHeaders,
      },
    );

    if (redeemError) {
      throw redeemError.value;
    }
    if (!redeemed) {
      throw new Error('Reward redeem response missing');
    }

    expect(redeemStatus).toBe(200);
    expect(redeemed.data.card.currentBalance).toBe(5);

    const [updatedReward] = (await db.select().from(rewards).where(eq(rewards.id, rewardId))) as Array<{
      stock: number | null;
    }>;
    expect(updatedReward?.stock).toBe(1);

    await db.delete(redemptions).where(eq(redemptions.rewardId, rewardId));
    await db.delete(campaignBalances).where(eq(campaignBalances.cardId, card!.id));
    await db.delete(balances).where(eq(balances.cardId, card!.id));
    await db.delete(cards).where(eq(cards.id, card!.id));
    await db.delete(rewards).where(eq(rewards.id, rewardId));
    await db.delete(campaigns).where(eq(campaigns.id, campaign!.id));
    await db.delete(stores).where(eq(stores.id, store!.id));
    await db.delete(users).where(eq(users.id, user!.id));
  });

  it('enforces cpg tenant scope for rewards list/create/get', async () => {
    const [ownedCpg] = (await db
      .insert(cpgs)
      .values({
        name: `CPG Rewards Own ${crypto.randomUUID().slice(0, 6)}`,
      })
      .returning({ id: cpgs.id })) as Array<{ id: string }>;

    const [foreignCpg] = (await db
      .insert(cpgs)
      .values({
        name: `CPG Rewards Foreign ${crypto.randomUUID().slice(0, 6)}`,
      })
      .returning({ id: cpgs.id })) as Array<{ id: string }>;

    if (!ownedCpg || !foreignCpg) {
      throw new Error('Failed to create CPG records');
    }

    const [ownedCampaign] = (await db
      .insert(campaigns)
      .values({
        name: `Campaign Rewards Own ${crypto.randomUUID().slice(0, 6)}`,
        cpgId: ownedCpg.id,
      })
      .returning({ id: campaigns.id })) as Array<{ id: string }>;

    const [foreignCampaign] = (await db
      .insert(campaigns)
      .values({
        name: `Campaign Rewards Foreign ${crypto.randomUUID().slice(0, 6)}`,
        cpgId: foreignCpg.id,
      })
      .returning({ id: campaigns.id })) as Array<{ id: string }>;

    if (!ownedCampaign || !foreignCampaign) {
      throw new Error('Failed to create campaign records');
    }

    const [ownedReward] = (await db
      .insert(rewards)
      .values({
        campaignId: ownedCampaign.id,
        name: `Reward Own ${crypto.randomUUID().slice(0, 5)}`,
        cost: 10,
        stock: 5,
        status: 'active',
      })
      .returning({ id: rewards.id })) as Array<{ id: string }>;

    const [foreignReward] = (await db
      .insert(rewards)
      .values({
        campaignId: foreignCampaign.id,
        name: `Reward Foreign ${crypto.randomUUID().slice(0, 5)}`,
        cost: 10,
        stock: 5,
        status: 'active',
      })
      .returning({ id: rewards.id })) as Array<{ id: string }>;

    if (!ownedReward || !foreignReward) {
      throw new Error('Failed to create reward records');
    }

    const cpgHeaders = {
      authorization: 'Bearer dev-token',
      'x-dev-user-id': 'dev-cpg-admin-rewards',
      'x-dev-user-role': 'cpg_admin',
      'x-dev-tenant-id': ownedCpg.id,
      'x-dev-tenant-type': 'cpg',
    };

    const ownList = await api.v1.rewards.get({
      headers: cpgHeaders,
    });

    if (ownList.error) {
      throw ownList.error.value;
    }
    if (!ownList.data) {
      throw new Error('Rewards list response missing');
    }

    expect(ownList.status).toBe(200);
    expect(ownList.data.data.some((item: { id: string }) => item.id === ownedReward.id)).toBe(true);
    expect(ownList.data.data.some((item: { id: string }) => item.id === foreignReward.id)).toBe(false);

    const forbiddenCreate = await api.v1.rewards.post(
      {
        campaignId: foreignCampaign.id,
        name: `Reward Blocked ${crypto.randomUUID().slice(0, 5)}`,
        cost: 8,
        stock: 3,
      },
      {
        headers: cpgHeaders,
      },
    );

    if (!forbiddenCreate.error) {
      throw new Error('Expected forbidden reward create');
    }

    expect(forbiddenCreate.status).toBe(403);

    const forbiddenGet = await api.v1.rewards({ rewardId: foreignReward.id }).get({
      headers: cpgHeaders,
    });

    if (!forbiddenGet.error) {
      throw new Error('Expected forbidden reward get');
    }

    expect(forbiddenGet.status).toBe(403);

    await db.delete(rewards).where(eq(rewards.id, foreignReward.id));
    await db.delete(rewards).where(eq(rewards.id, ownedReward.id));
    await db.delete(campaigns).where(eq(campaigns.id, foreignCampaign.id));
    await db.delete(campaigns).where(eq(campaigns.id, ownedCampaign.id));
    await db.delete(cpgs).where(eq(cpgs.id, foreignCpg.id));
    await db.delete(cpgs).where(eq(cpgs.id, ownedCpg.id));
  });
});
