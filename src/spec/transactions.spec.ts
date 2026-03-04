import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { and, eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import {
  accumulations,
  balances,
  campaignBalances,
  brands,
  campaignAccumulationRules,
  campaignPolicies,
  campaignTiers,
  cards,
  campaignSubscriptions,
  campaigns,
  cpgs,
  products,
  stores,
  transactions,
  users,
  webhookReceipts,
} from '../db/schema';
import { ensureUserUniversalWalletCard, UNIVERSAL_CAMPAIGN_KEY } from '../services/wallet-onboarding';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.WEBHOOK_SECRET_TCONECTA = 'test_webhook_secret';

const app = createApp();
const api = treaty<App>(app);

const adminHeaders = {
  authorization: 'Bearer dev-token',
  'x-dev-user-id': 'dev-admin',
  'x-dev-user-role': 'qoa_admin',
};

const webhookSignature = (payload: unknown) =>
  createHmac('sha256', process.env.WEBHOOK_SECRET_TCONECTA ?? '')
    .update(JSON.stringify(payload))
    .digest('hex');

const createUser = async () => {
  const phone = `+52155${Math.floor(Math.random() * 10_000_000)
    .toString()
    .padStart(7, '0')}`;
  const email = `tx_${crypto.randomUUID()}@qoa.test`;

  const [created] = (await db
    .insert(users)
    .values({
      phone,
      email,
      role: 'consumer',
    })
    .returning({ id: users.id })) as Array<{ id: string }>;

  if (!created) {
    throw new Error('Failed to create test user');
  }

  return created;
};

const createStore = async () => {
  const [created] = (await db
    .insert(stores)
    .values({
      name: 'Store TX',
      code: `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      type: 'tiendita',
    })
    .returning({ id: stores.id })) as Array<{ id: string }>;

  if (!created) {
    throw new Error('Failed to create test store');
  }

  return created;
};

const createProduct = async () => {
  const [cpg] = (await db
    .insert(cpgs)
    .values({
      name: `CPG TX ${crypto.randomUUID().slice(0, 6)}`,
    })
    .returning({ id: cpgs.id })) as Array<{ id: string }>;

  if (!cpg) {
    throw new Error('Failed to create test cpg');
  }

  const [brand] = (await db
    .insert(brands)
    .values({
      cpgId: cpg.id,
      name: `Brand TX ${crypto.randomUUID().slice(0, 6)}`,
    })
    .returning({ id: brands.id })) as Array<{ id: string }>;

  if (!brand) {
    throw new Error('Failed to create test brand');
  }

  const [product] = (await db
    .insert(products)
    .values({
      brandId: brand.id,
      sku: `SKU-TX-${crypto.randomUUID().slice(0, 8)}`,
      name: `Product TX ${crypto.randomUUID().slice(0, 6)}`,
    })
    .returning({ id: products.id })) as Array<{ id: string }>;

  if (!product) {
    throw new Error('Failed to create test product');
  }

  return {
    cpgId: cpg.id,
    brandId: brand.id,
    productId: product.id,
  };
};

const createPolicyFixture = async () => {
  const user = await createUser();
  const store = await createStore();
  const catalog = await createProduct();
  const [campaign] = (await db
    .insert(campaigns)
    .values({
      name: `Campaign Policy ${crypto.randomUUID().slice(0, 6)}`,
    })
    .returning({ id: campaigns.id })) as Array<{ id: string }>;

  if (!campaign) {
    throw new Error('Failed to create policy campaign');
  }

  const [card] = (await db
    .insert(cards)
    .values({
      userId: user.id,
      campaignId: campaign.id,
      storeId: store.id,
      code: `card_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
    })
    .returning({ id: cards.id })) as Array<{ id: string }>;

  if (!card) {
    throw new Error('Failed to create policy card');
  }

  return {
    user,
    store,
    catalog,
    campaign,
    card,
  };
};

const cleanupPolicyFixture = async (fixture: {
  user: { id: string };
  store: { id: string };
  catalog: { cpgId: string; brandId: string; productId: string };
  campaign: { id: string };
  card: { id: string };
}) => {
  await db.delete(transactions).where(eq(transactions.userId, fixture.user.id));
  await db.delete(campaignBalances).where(eq(campaignBalances.cardId, fixture.card.id));
  await db.delete(accumulations).where(eq(accumulations.cardId, fixture.card.id));
  await db.delete(balances).where(eq(balances.cardId, fixture.card.id));
  await db.delete(cards).where(eq(cards.id, fixture.card.id));
  await db.delete(campaignPolicies).where(eq(campaignPolicies.campaignId, fixture.campaign.id));
  await db.delete(campaigns).where(eq(campaigns.id, fixture.campaign.id));
  await db.delete(products).where(eq(products.id, fixture.catalog.productId));
  await db.delete(brands).where(eq(brands.id, fixture.catalog.brandId));
  await db.delete(cpgs).where(eq(cpgs.id, fixture.catalog.cpgId));
  await db.delete(stores).where(eq(stores.id, fixture.store.id));
  await db.delete(users).where(eq(users.id, fixture.user.id));
};

describe('Transactions module', () => {
  it('creates and retrieves transaction details', async () => {
    const user = await createUser();
    const store = await createStore();
    const catalog = await createProduct();
    const [campaign] = (await db
      .insert(campaigns)
      .values({
        name: `Campaign TX ${crypto.randomUUID().slice(0, 6)}`,
      })
      .returning({ id: campaigns.id })) as Array<{ id: string }>;

    if (!campaign) {
      throw new Error('Failed to create test campaign');
    }
    const [card] = (await db
      .insert(cards)
      .values({
        userId: user.id,
        campaignId: campaign.id,
        storeId: store.id,
        code: `card_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      })
      .returning({ id: cards.id, campaignId: cards.campaignId })) as Array<{
      id: string;
      campaignId: string;
    }>;

    if (!card) {
      throw new Error('Failed to create test card');
    }

    const idempotencyKey = `tx-key-${crypto.randomUUID()}`;

    const {
      data: created,
      error: createError,
      status: createStatus,
    } = await api.v1.transactions.post(
      {
        userId: user.id,
        storeId: store.id,
        cardId: card.id,
        idempotencyKey,
        items: [
          {
            productId: catalog.productId,
            quantity: 2,
            amount: 15,
          },
        ],
      },
      {
        headers: adminHeaders,
      },
    );

    if (createError) {
      throw createError.value;
    }
    if (!created) {
      throw new Error('Transaction response missing');
    }

    expect(createStatus).toBe(201);
    expect(created.data.totalAmount).toBe(30);
    expect(created.data.accumulations.length).toBeGreaterThanOrEqual(1);
    const campaignAccumulation = created.data.accumulations.find(
      (entry: { campaignId: string }) => entry.campaignId === card.campaignId,
    );
    expect(campaignAccumulation?.cardId).toBe(card.id);
    expect(campaignAccumulation?.accumulated).toBe(2);
    expect(campaignAccumulation?.newBalance).toBe(2);

    const txId = created.data.id;

    const {
      data: replayed,
      error: replayError,
      status: replayStatus,
    } = await api.v1.transactions.post(
      {
        userId: user.id,
        storeId: store.id,
        cardId: card.id,
        idempotencyKey,
        items: [
          {
            productId: catalog.productId,
            quantity: 2,
            amount: 15,
          },
        ],
      },
      {
        headers: adminHeaders,
      },
    );

    if (replayError) {
      throw replayError.value;
    }
    if (!replayed) {
      throw new Error('Replay response missing');
    }

    expect(replayStatus).toBe(200);
    expect(replayed.data.id).toBe(txId);
    expect(replayed.data.accumulations.length).toBeGreaterThanOrEqual(1);
    const replayCampaignAccumulation = replayed.data.accumulations.find(
      (entry: { campaignId: string }) => entry.campaignId === card.campaignId,
    );
    expect(replayCampaignAccumulation?.newBalance).toBe(2);

    const {
      data: listed,
      error: listError,
      status: listStatus,
    } = await api.v1.transactions.get({
      query: {
        userId: user.id,
        limit: '10',
      },
      headers: adminHeaders,
    });

    if (listError) {
      throw listError.value;
    }
    if (!listed) {
      throw new Error('Transaction list missing');
    }

    expect(listStatus).toBe(200);
    expect(listed.data.some((tx: { id: string }) => tx.id === txId)).toBe(true);

    const {
      data: filtered,
      error: filteredError,
      status: filteredStatus,
    } = await api.v1.transactions.get({
      query: {
        q: txId,
        limit: '10',
      },
      headers: adminHeaders,
    });

    if (filteredError) {
      throw filteredError.value;
    }
    if (!filtered) {
      throw new Error('Transaction filtered response missing');
    }

    expect(filteredStatus).toBe(200);
    expect(filtered.data.some((tx: { id: string }) => tx.id === txId)).toBe(true);

    const {
      data: detail,
      error: detailError,
      status: detailStatus,
    } = await api.v1
      .transactions({
        transactionId: txId,
      })
      .get({ headers: adminHeaders });

    if (detailError) {
      throw detailError.value;
    }
    if (!detail) {
      throw new Error('Transaction detail missing');
    }

    expect(detailStatus).toBe(200);
    expect(detail.data.items.length).toBe(1);
    expect(detail.data.accumulations.length).toBeGreaterThanOrEqual(1);

    const [balance] = (await db
      .select({
        current: balances.current,
        lifetime: balances.lifetime,
      })
      .from(balances)
      .where(eq(balances.cardId, card.id))) as Array<{
      current: number;
      lifetime: number;
    }>;
    expect(balance?.current).toBeGreaterThanOrEqual(2);
    expect(balance?.lifetime).toBeGreaterThanOrEqual(2);

    const [campaignBalance] = (await db
      .select({
        current: campaignBalances.current,
      })
      .from(campaignBalances)
      .where(and(eq(campaignBalances.cardId, card.id), eq(campaignBalances.campaignId, card.campaignId)))) as Array<{
      current: number;
    }>;

    expect(campaignBalance?.current).toBe(2);

    await db.delete(campaignBalances).where(eq(campaignBalances.cardId, card.id));
    await db.delete(accumulations).where(eq(accumulations.cardId, card.id));
    await db.delete(balances).where(eq(balances.cardId, card.id));
    await db.delete(cards).where(eq(cards.id, card.id));
    await db.delete(campaigns).where(eq(campaigns.id, campaign.id));
    await db.delete(transactions).where(eq(transactions.id, txId));
    await db.delete(products).where(eq(products.id, catalog.productId));
    await db.delete(brands).where(eq(brands.id, catalog.brandId));
    await db.delete(cpgs).where(eq(cpgs.id, catalog.cpgId));
    await db.delete(stores).where(eq(stores.id, store.id));
    await db.delete(users).where(eq(users.id, user.id));
  });

  it('allows consumer wallet flow with user-scoped create/list/detail', async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const store = await createStore();
    const catalog = await createProduct();
    const [campaign] = (await db
      .insert(campaigns)
      .values({
        name: `Campaign Wallet ${crypto.randomUUID().slice(0, 6)}`,
      })
      .returning({ id: campaigns.id })) as Array<{ id: string }>;

    if (!campaign) {
      throw new Error('Failed to create campaign');
    }

    const [card] = (await db
      .insert(cards)
      .values({
        userId: user.id,
        campaignId: campaign.id,
        storeId: store.id,
        code: `card_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      })
      .returning({ id: cards.id })) as Array<{ id: string }>;

    if (!card) {
      throw new Error('Failed to create user card');
    }

    const walletHeaders = {
      authorization: 'Bearer dev-token',
      'x-dev-user-id': user.id,
      'x-dev-user-role': 'consumer',
    };

    const createOwn = await api.v1.transactions.post(
      {
        userId: user.id,
        storeId: store.id,
        cardId: card.id,
        items: [
          {
            productId: catalog.productId,
            quantity: 1,
            amount: 42,
          },
        ],
      },
      {
        headers: walletHeaders,
      },
    );

    if (createOwn.error) {
      throw createOwn.error.value;
    }
    if (!createOwn.data) {
      throw new Error('Wallet transaction response missing');
    }

    expect(createOwn.status).toBe(201);

    const createOther = await api.v1.transactions.post(
      {
        userId: otherUser.id,
        storeId: store.id,
        cardId: card.id,
        items: [
          {
            productId: catalog.productId,
            quantity: 1,
            amount: 15,
          },
        ],
      },
      {
        headers: walletHeaders,
      },
    );

    if (!createOther.error) {
      throw new Error('Expected forbidden wallet create for other user');
    }

    expect(createOther.status).toBe(403);

    const listed = await api.v1.transactions.get({
      query: {
        userId: otherUser.id,
      },
      headers: walletHeaders,
    });

    if (listed.error) {
      throw listed.error.value;
    }
    if (!listed.data) {
      throw new Error('Wallet list response missing');
    }

    expect(listed.status).toBe(200);
    expect(listed.data.data.length).toBeGreaterThanOrEqual(1);
    expect(listed.data.data.every((tx: { userId: string }) => tx.userId === user.id)).toBe(true);

    const detail = await api.v1.transactions({ transactionId: createOwn.data.data.id }).get({
      headers: walletHeaders,
    });

    if (detail.error) {
      throw detail.error.value;
    }
    if (!detail.data) {
      throw new Error('Wallet detail response missing');
    }

    expect(detail.status).toBe(200);
    expect(detail.data.data.userId).toBe(user.id);

    await db.delete(accumulations).where(eq(accumulations.cardId, card.id));
    await db.delete(balances).where(eq(balances.cardId, card.id));
    await db.delete(transactions).where(eq(transactions.cardId, card.id));
    await db.delete(cards).where(eq(cards.id, card.id));
    await db.delete(campaigns).where(eq(campaigns.id, campaign.id));
    await db.delete(stores).where(eq(stores.id, store.id));
    await db.delete(users).where(eq(users.id, otherUser.id));
    await db.delete(users).where(eq(users.id, user.id));
    await db.delete(products).where(eq(products.id, catalog.productId));
    await db.delete(brands).where(eq(brands.id, catalog.brandId));
    await db.delete(cpgs).where(eq(cpgs.id, catalog.cpgId));
  });

  it('accumulates into universal and subscribed campaigns with a single card', async () => {
    const user = await createUser();
    const store = await createStore();
    const catalog = await createProduct();

    const universal = await ensureUserUniversalWalletCard(user.id);

    const [optInCampaign] = (await db
      .insert(campaigns)
      .values({
        name: `Campaign Opt-In ${crypto.randomUUID().slice(0, 6)}`,
        status: 'active',
        enrollmentMode: 'opt_in',
      })
      .returning({ id: campaigns.id })) as Array<{ id: string }>;

    if (!optInCampaign) {
      throw new Error('Failed to create opt-in campaign');
    }

    await db.insert(campaignSubscriptions).values({
      userId: user.id,
      campaignId: optInCampaign.id,
      status: 'subscribed',
      subscribedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const walletHeaders = {
      authorization: 'Bearer dev-token',
      'x-dev-user-id': user.id,
      'x-dev-user-role': 'consumer',
    };

    const created = await api.v1.transactions.post(
      {
        userId: user.id,
        storeId: store.id,
        items: [
          {
            productId: catalog.productId,
            quantity: 1,
            amount: 35,
          },
        ],
      },
      {
        headers: walletHeaders,
      },
    );

    if (created.error) {
      throw created.error.value;
    }
    if (!created.data) {
      throw new Error('Multi campaign transaction response missing');
    }

    expect(created.status).toBe(201);
    const campaignIds = new Set(created.data.data.accumulations.map((row: { campaignId: string }) => row.campaignId));
    expect(campaignIds.has(optInCampaign.id)).toBe(true);

    const [universalCampaign] = (await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.key, UNIVERSAL_CAMPAIGN_KEY))) as Array<{ id: string }>;

    expect(campaignIds.has(universalCampaign?.id ?? '')).toBe(true);

    await db.delete(campaignBalances).where(eq(campaignBalances.cardId, universal.cardId));
    await db.delete(accumulations).where(eq(accumulations.cardId, universal.cardId));
    await db.delete(balances).where(eq(balances.cardId, universal.cardId));
    await db.delete(cards).where(eq(cards.id, universal.cardId));
    await db.delete(campaignSubscriptions).where(eq(campaignSubscriptions.userId, user.id));
    await db.delete(campaigns).where(eq(campaigns.id, optInCampaign.id));
    await db.delete(transactions).where(eq(transactions.userId, user.id));
    await db.delete(stores).where(eq(stores.id, store.id));
    await db.delete(users).where(eq(users.id, user.id));
    await db.delete(products).where(eq(products.id, catalog.productId));
    await db.delete(brands).where(eq(brands.id, catalog.brandId));
    await db.delete(cpgs).where(eq(cpgs.id, catalog.cpgId));
  });

  it('applies max_accumulations campaign policy', async () => {
    const user = await createUser();
    const store = await createStore();
    const catalog = await createProduct();
    const [campaign] = (await db
      .insert(campaigns)
      .values({
        name: `Campaign Rules ${crypto.randomUUID().slice(0, 6)}`,
      })
      .returning({ id: campaigns.id })) as Array<{ id: string }>;

    if (!campaign) {
      throw new Error('Failed to create test campaign');
    }

    await db.insert(campaignPolicies).values({
      campaignId: campaign.id,
      policyType: 'max_accumulations',
      scopeType: 'campaign',
      period: 'day',
      value: 1,
      active: true,
      updatedAt: new Date(),
    });

    const [card] = (await db
      .insert(cards)
      .values({
        userId: user.id,
        campaignId: campaign.id,
        storeId: store.id,
        code: `card_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      })
      .returning({ id: cards.id })) as Array<{ id: string }>;

    if (!card) {
      throw new Error('Failed to create test card');
    }

    const firstTx = await api.v1.transactions.post(
      {
        userId: user.id,
        storeId: store.id,
        cardId: card.id,
        items: [
          {
            productId: catalog.productId,
            quantity: 1,
            amount: 20,
          },
        ],
      },
      {
        headers: adminHeaders,
      },
    );

    if (firstTx.error) {
      throw firstTx.error.value;
    }
    if (!firstTx.data) {
      throw new Error('First tx response missing');
    }

    expect(firstTx.status).toBe(201);
    expect(firstTx.data.data.accumulations.length).toBeGreaterThanOrEqual(1);
    const firstCampaignAccRows = firstTx.data.data.accumulations.filter(
      (entry: { campaignId: string }) => entry.campaignId === campaign.id,
    );
    expect(firstCampaignAccRows.length).toBe(1);

    const secondTx = await api.v1.transactions.post(
      {
        userId: user.id,
        storeId: store.id,
        cardId: card.id,
        items: [
          {
            productId: catalog.productId,
            quantity: 1,
            amount: 20,
          },
        ],
      },
      {
        headers: adminHeaders,
      },
    );

    if (secondTx.error) {
      throw secondTx.error.value;
    }
    if (!secondTx.data) {
      throw new Error('Second tx response missing');
    }

    expect(secondTx.status).toBe(201);
    const secondCampaignAccRows = secondTx.data.data.accumulations.filter(
      (entry: { campaignId: string }) => entry.campaignId === campaign.id,
    );
    expect(secondCampaignAccRows.length).toBe(0);

    const [balance] = (await db
      .select({
        current: balances.current,
      })
      .from(balances)
      .where(eq(balances.cardId, card.id))) as Array<{ current: number }>;

    expect(balance?.current).toBeGreaterThanOrEqual(2);

    const [campaignBalance] = (await db
      .select({
        current: campaignBalances.current,
      })
      .from(campaignBalances)
      .where(and(eq(campaignBalances.cardId, card.id), eq(campaignBalances.campaignId, campaign.id)))) as Array<{
      current: number;
    }>;

    expect(campaignBalance?.current).toBe(1);

    if (firstTx.data.data.id) {
      await db.delete(transactions).where(eq(transactions.id, firstTx.data.data.id));
    }
    if (secondTx.data.data.id) {
      await db.delete(transactions).where(eq(transactions.id, secondTx.data.data.id));
    }
    await db.delete(campaignBalances).where(eq(campaignBalances.cardId, card.id));
    await db.delete(accumulations).where(eq(accumulations.cardId, card.id));
    await db.delete(balances).where(eq(balances.cardId, card.id));
    await db.delete(cards).where(eq(cards.id, card.id));
    await db.delete(campaignPolicies).where(eq(campaignPolicies.campaignId, campaign.id));
    await db.delete(campaigns).where(eq(campaigns.id, campaign.id));
    await db.delete(products).where(eq(products.id, catalog.productId));
    await db.delete(brands).where(eq(brands.id, catalog.brandId));
    await db.delete(cpgs).where(eq(cpgs.id, catalog.cpgId));
    await db.delete(stores).where(eq(stores.id, store.id));
    await db.delete(users).where(eq(users.id, user.id));
  });

  it('applies min_quantity campaign policy', async () => {
    const fixture = await createPolicyFixture();

    await db.insert(campaignPolicies).values({
      campaignId: fixture.campaign.id,
      policyType: 'min_quantity',
      scopeType: 'campaign',
      period: 'transaction',
      value: 2,
      active: true,
      updatedAt: new Date(),
    });

    const lowQty = await api.v1.transactions.post(
      {
        userId: fixture.user.id,
        storeId: fixture.store.id,
        cardId: fixture.card.id,
        items: [
          {
            productId: fixture.catalog.productId,
            quantity: 1,
            amount: 30,
          },
        ],
      },
      { headers: adminHeaders },
    );

    if (lowQty.error || !lowQty.data) {
      throw lowQty.error?.value ?? new Error('Low quantity tx missing');
    }

    expect(lowQty.status).toBe(201);
    const lowQtyCampaignAcc = lowQty.data.data.accumulations.filter(
      (entry: { campaignId: string }) => entry.campaignId === fixture.campaign.id,
    );
    expect(lowQtyCampaignAcc.length).toBe(0);

    const validQty = await api.v1.transactions.post(
      {
        userId: fixture.user.id,
        storeId: fixture.store.id,
        cardId: fixture.card.id,
        items: [
          {
            productId: fixture.catalog.productId,
            quantity: 2,
            amount: 30,
          },
        ],
      },
      { headers: adminHeaders },
    );

    if (validQty.error || !validQty.data) {
      throw validQty.error?.value ?? new Error('Valid quantity tx missing');
    }

    const validQtyCampaignAcc = validQty.data.data.accumulations.filter(
      (entry: { campaignId: string }) => entry.campaignId === fixture.campaign.id,
    );
    expect(validQtyCampaignAcc.length).toBe(1);

    await cleanupPolicyFixture(fixture);
  });

  it('applies cooldown campaign policy', async () => {
    const fixture = await createPolicyFixture();

    await db.insert(campaignPolicies).values({
      campaignId: fixture.campaign.id,
      policyType: 'cooldown',
      scopeType: 'campaign',
      period: 'day',
      value: 24,
      active: true,
      updatedAt: new Date(),
    });

    const firstTx = await api.v1.transactions.post(
      {
        userId: fixture.user.id,
        storeId: fixture.store.id,
        cardId: fixture.card.id,
        items: [
          {
            productId: fixture.catalog.productId,
            quantity: 1,
            amount: 25,
          },
        ],
      },
      { headers: adminHeaders },
    );

    if (firstTx.error || !firstTx.data) {
      throw firstTx.error?.value ?? new Error('First cooldown tx missing');
    }

    const firstCampaignAcc = firstTx.data.data.accumulations.filter(
      (entry: { campaignId: string }) => entry.campaignId === fixture.campaign.id,
    );
    expect(firstCampaignAcc.length).toBe(1);

    const secondTx = await api.v1.transactions.post(
      {
        userId: fixture.user.id,
        storeId: fixture.store.id,
        cardId: fixture.card.id,
        items: [
          {
            productId: fixture.catalog.productId,
            quantity: 1,
            amount: 25,
          },
        ],
      },
      { headers: adminHeaders },
    );

    if (secondTx.error || !secondTx.data) {
      throw secondTx.error?.value ?? new Error('Second cooldown tx missing');
    }

    const secondCampaignAcc = secondTx.data.data.accumulations.filter(
      (entry: { campaignId: string }) => entry.campaignId === fixture.campaign.id,
    );
    expect(secondCampaignAcc.length).toBe(0);

    await cleanupPolicyFixture(fixture);
  });

  it('applies combined min_amount and min_quantity policies', async () => {
    const fixture = await createPolicyFixture();

    await db.insert(campaignPolicies).values([
      {
        campaignId: fixture.campaign.id,
        policyType: 'min_amount',
        scopeType: 'campaign',
        period: 'transaction',
        value: 100,
        active: true,
        updatedAt: new Date(),
      },
      {
        campaignId: fixture.campaign.id,
        policyType: 'min_quantity',
        scopeType: 'campaign',
        period: 'transaction',
        value: 2,
        active: true,
        updatedAt: new Date(),
      },
    ]);

    const lowAmountTx = await api.v1.transactions.post(
      {
        userId: fixture.user.id,
        storeId: fixture.store.id,
        cardId: fixture.card.id,
        items: [
          {
            productId: fixture.catalog.productId,
            quantity: 2,
            amount: 30,
          },
        ],
      },
      { headers: adminHeaders },
    );

    if (lowAmountTx.error || !lowAmountTx.data) {
      throw lowAmountTx.error?.value ?? new Error('Low amount tx missing');
    }

    const lowAmountCampaignAcc = lowAmountTx.data.data.accumulations.filter(
      (entry: { campaignId: string }) => entry.campaignId === fixture.campaign.id,
    );
    expect(lowAmountCampaignAcc.length).toBe(0);

    const validTx = await api.v1.transactions.post(
      {
        userId: fixture.user.id,
        storeId: fixture.store.id,
        cardId: fixture.card.id,
        items: [
          {
            productId: fixture.catalog.productId,
            quantity: 2,
            amount: 60,
          },
        ],
      },
      { headers: adminHeaders },
    );

    if (validTx.error || !validTx.data) {
      throw validTx.error?.value ?? new Error('Valid combined policy tx missing');
    }

    const validCampaignAcc = validTx.data.data.accumulations.filter(
      (entry: { campaignId: string }) => entry.campaignId === fixture.campaign.id,
    );
    expect(validCampaignAcc.length).toBe(1);

    await cleanupPolicyFixture(fixture);
  });

  it('ignores inactive campaign policy', async () => {
    const fixture = await createPolicyFixture();

    await db.insert(campaignPolicies).values({
      campaignId: fixture.campaign.id,
      policyType: 'min_quantity',
      scopeType: 'campaign',
      period: 'transaction',
      value: 99,
      active: false,
      updatedAt: new Date(),
    });

    const tx = await api.v1.transactions.post(
      {
        userId: fixture.user.id,
        storeId: fixture.store.id,
        cardId: fixture.card.id,
        items: [
          {
            productId: fixture.catalog.productId,
            quantity: 1,
            amount: 20,
          },
        ],
      },
      { headers: adminHeaders },
    );

    if (tx.error || !tx.data) {
      throw tx.error?.value ?? new Error('Inactive policy tx missing');
    }

    expect(tx.status).toBe(201);
    const campaignAcc = tx.data.data.accumulations.filter(
      (entry: { campaignId: string }) => entry.campaignId === fixture.campaign.id,
    );
    expect(campaignAcc.length).toBe(1);

    await cleanupPolicyFixture(fixture);
  });

  it('uses amount accumulation mode and product-level multiplier rules', async () => {
    const fixture = await createPolicyFixture();

    await db
      .update(campaigns)
      .set({ accumulationMode: 'amount', updatedAt: new Date() })
      .where(eq(campaigns.id, fixture.campaign.id));

    await db.insert(campaignAccumulationRules).values({
      campaignId: fixture.campaign.id,
      scopeType: 'campaign',
      multiplier: 1,
      flatBonus: 0,
      priority: 100,
      active: true,
      updatedAt: new Date(),
    });

    await db.insert(campaignAccumulationRules).values({
      campaignId: fixture.campaign.id,
      scopeType: 'product',
      scopeId: fixture.catalog.productId,
      scopeProductId: fixture.catalog.productId,
      multiplier: 2,
      flatBonus: 5,
      priority: 1,
      active: true,
      updatedAt: new Date(),
    });

    const tx = await api.v1.transactions.post(
      {
        userId: fixture.user.id,
        storeId: fixture.store.id,
        cardId: fixture.card.id,
        items: [
          {
            productId: fixture.catalog.productId,
            quantity: 2,
            amount: 10,
          },
        ],
      },
      { headers: adminHeaders },
    );

    if (tx.error || !tx.data) {
      throw tx.error?.value ?? new Error('Amount accumulation transaction missing');
    }

    expect(tx.status).toBe(201);
    const campaignAcc = tx.data.data.accumulations.find(
      (entry: { campaignId: string }) => entry.campaignId === fixture.campaign.id,
    ) as { accumulated: number } | undefined;
    expect(campaignAcc?.accumulated).toBe(45);

    const [campaignBalance] = (await db
      .select({ current: campaignBalances.current })
      .from(campaignBalances)
      .where(
        and(eq(campaignBalances.cardId, fixture.card.id), eq(campaignBalances.campaignId, fixture.campaign.id)),
      )) as Array<{
      current: number;
    }>;

    expect(campaignBalance?.current).toBe(45);

    await cleanupPolicyFixture(fixture);
  });

  it('evaluates rolling tiers and marks card as at_risk when the window no longer qualifies', async () => {
    const fixture = await createPolicyFixture();

    const [tier] = (await db
      .insert(campaignTiers)
      .values({
        campaignId: fixture.campaign.id,
        name: 'Silver',
        order: 1,
        thresholdValue: 1,
        windowUnit: 'day',
        windowValue: 1,
        minPurchaseCount: 1,
        qualificationMode: 'any',
        graceDays: 7,
      })
      .returning({ id: campaignTiers.id })) as Array<{ id: string }>;

    if (!tier) {
      throw new Error('Failed to create tier');
    }

    const { error: txError } = await api.v1.transactions.post(
      {
        userId: fixture.user.id,
        storeId: fixture.store.id,
        cardId: fixture.card.id,
        items: [
          {
            productId: fixture.catalog.productId,
            quantity: 1,
            amount: 50,
          },
        ],
      },
      {
        headers: adminHeaders,
      },
    );

    if (txError) {
      throw txError.value;
    }

    const [qualifiedCard] = (await db
      .select({ currentTierId: cards.currentTierId, tierGraceUntil: cards.tierGraceUntil })
      .from(cards)
      .where(eq(cards.id, fixture.card.id))) as Array<{ currentTierId: string | null; tierGraceUntil: Date | null }>;

    expect(qualifiedCard?.currentTierId).toBe(tier.id);
    expect(qualifiedCard?.tierGraceUntil).toBeNull();

    await db
      .update(accumulations)
      .set({ createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) })
      .where(and(eq(accumulations.cardId, fixture.card.id), eq(accumulations.campaignId, fixture.campaign.id)));

    const {
      data: runData,
      error: runError,
      status: runStatus,
    } = await api.v1.jobs.tiers.run.post(
      {
        limit: 100,
      },
      {
        headers: adminHeaders,
      },
    );

    if (runError) {
      throw runError.value;
    }
    if (!runData) {
      throw new Error('Tier run response missing');
    }

    expect(runStatus).toBe(200);
    expect(runData.data.atRisk).toBeGreaterThanOrEqual(1);

    const [atRiskCard] = (await db
      .select({ currentTierId: cards.currentTierId, tierGraceUntil: cards.tierGraceUntil })
      .from(cards)
      .where(eq(cards.id, fixture.card.id))) as Array<{ currentTierId: string | null; tierGraceUntil: Date | null }>;

    expect(atRiskCard?.currentTierId).toBe(tier.id);
    expect(atRiskCard?.tierGraceUntil).toBeInstanceOf(Date);

    await cleanupPolicyFixture(fixture);
  });

  it('deduplicates webhook retries using payload hash', async () => {
    const user = await createUser();
    const store = await createStore();
    const catalog = await createProduct();

    const payload = {
      source: 'tconecta',
      externalEventId: `evt_${crypto.randomUUID()}`,
      userId: user.id,
      storeId: store.id,
      items: [
        {
          productId: catalog.productId,
          quantity: 1,
          amount: 25,
        },
      ],
    };

    const signature = webhookSignature(payload);

    const {
      data: first,
      error: firstError,
      status: firstStatus,
    } = await api.v1.transactions.webhook.post(payload, {
      headers: {
        ...adminHeaders,
        'x-webhook-signature': signature,
      },
    });

    if (firstError) {
      throw firstError.value;
    }
    if (!first) {
      throw new Error('First webhook response missing');
    }

    expect(firstStatus).toBe(201);
    expect(first.meta.replayed).toBe(false);

    const {
      data: second,
      error: secondError,
      status: secondStatus,
    } = await api.v1.transactions.webhook.post(payload, {
      headers: {
        ...adminHeaders,
        'x-webhook-signature': signature,
      },
    });

    if (secondError) {
      throw secondError.value;
    }
    if (!second) {
      throw new Error('Second webhook response missing');
    }

    expect(secondStatus).toBe(200);
    expect(second.meta.replayed).toBe(true);
    expect(second.data.id).toBe(first.data.id);

    const receipts = await db.select().from(webhookReceipts).where(eq(webhookReceipts.hash, first.meta.hash));
    expect(receipts.length).toBe(1);

    await db.delete(webhookReceipts).where(eq(webhookReceipts.hash, first.meta.hash));
    await db.delete(transactions).where(eq(transactions.id, first.data.id));
    await db.delete(products).where(eq(products.id, catalog.productId));
    await db.delete(brands).where(eq(brands.id, catalog.brandId));
    await db.delete(cpgs).where(eq(cpgs.id, catalog.cpgId));
    await db.delete(stores).where(eq(stores.id, store.id));
    await db.delete(users).where(eq(users.id, user.id));
  });

  it('rejects webhook with invalid signature', async () => {
    const user = await createUser();
    const store = await createStore();
    const catalog = await createProduct();

    const payload = {
      source: 'tconecta',
      externalEventId: `evt_${crypto.randomUUID()}`,
      userId: user.id,
      storeId: store.id,
      items: [
        {
          productId: catalog.productId,
          quantity: 1,
          amount: 10,
        },
      ],
    };

    const { error, status } = await api.v1.transactions.webhook.post(payload, {
      headers: {
        ...adminHeaders,
        'x-webhook-signature': 'bad-signature',
      },
    });

    if (!error) {
      throw new Error('Expected invalid signature error');
    }

    expect(status).toBe(401);
    expect(error.value.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');

    await db.delete(products).where(eq(products.id, catalog.productId));
    await db.delete(brands).where(eq(brands.id, catalog.brandId));
    await db.delete(cpgs).where(eq(cpgs.id, catalog.cpgId));
    await db.delete(stores).where(eq(stores.id, store.id));
    await db.delete(users).where(eq(users.id, user.id));
  });

  it('rate limits webhook bursts and allows retry after window reset', async () => {
    const previousMax = process.env.WEBHOOK_RATE_LIMIT_MAX;
    const previousWindow = process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS;

    process.env.WEBHOOK_RATE_LIMIT_MAX = '1';
    process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS = '50';

    const user = await createUser();
    const store = await createStore();
    const catalog = await createProduct();

    const firstPayload = {
      source: 'tconecta',
      externalEventId: `evt_${crypto.randomUUID()}`,
      userId: user.id,
      storeId: store.id,
      items: [
        {
          productId: catalog.productId,
          quantity: 1,
          amount: 20,
        },
      ],
    };

    const secondPayload = {
      ...firstPayload,
      externalEventId: `evt_${crypto.randomUUID()}`,
    };

    const thirdPayload = {
      ...firstPayload,
      externalEventId: `evt_${crypto.randomUUID()}`,
    };

    try {
      const firstResponse = await api.v1.transactions.webhook.post(firstPayload, {
        headers: {
          ...adminHeaders,
          'x-webhook-signature': webhookSignature(firstPayload),
        },
      });

      if (firstResponse.error) {
        throw firstResponse.error.value;
      }
      if (!firstResponse.data) {
        throw new Error('First webhook response missing');
      }

      expect(firstResponse.status).toBe(201);

      const secondResponse = await api.v1.transactions.webhook.post(secondPayload, {
        headers: {
          ...adminHeaders,
          'x-webhook-signature': webhookSignature(secondPayload),
        },
      });

      if (!secondResponse.error) {
        throw new Error('Expected rate limit error on second webhook');
      }

      expect(secondResponse.status).toBe(429);
      expect(secondResponse.error.value.error.code).toBe('RATE_LIMITED');

      await Bun.sleep(70);

      const thirdResponse = await api.v1.transactions.webhook.post(thirdPayload, {
        headers: {
          ...adminHeaders,
          'x-webhook-signature': webhookSignature(thirdPayload),
        },
      });

      if (thirdResponse.error) {
        throw thirdResponse.error.value;
      }
      if (!thirdResponse.data) {
        throw new Error('Third webhook response missing');
      }

      expect(thirdResponse.status).toBe(201);
    } finally {
      if (previousMax) {
        process.env.WEBHOOK_RATE_LIMIT_MAX = previousMax;
      } else {
        delete process.env.WEBHOOK_RATE_LIMIT_MAX;
      }

      if (previousWindow) {
        process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS = previousWindow;
      } else {
        delete process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS;
      }

      await db.delete(webhookReceipts).where(eq(webhookReceipts.externalEventId, firstPayload.externalEventId));
      await db.delete(webhookReceipts).where(eq(webhookReceipts.externalEventId, secondPayload.externalEventId));
      await db.delete(webhookReceipts).where(eq(webhookReceipts.externalEventId, thirdPayload.externalEventId));
      await db.delete(transactions).where(eq(transactions.userId, user.id));
      await db.delete(products).where(eq(products.id, catalog.productId));
      await db.delete(brands).where(eq(brands.id, catalog.brandId));
      await db.delete(cpgs).where(eq(cpgs.id, catalog.cpgId));
      await db.delete(stores).where(eq(stores.id, store.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  });

  it('returns webhook receipts and metrics', async () => {
    const {
      data: receipts,
      error: receiptsError,
      status: receiptsStatus,
    } = await api.v1.transactions['webhook-receipts'].get({
      query: {
        limit: '10',
      },
      headers: adminHeaders,
    });

    if (receiptsError) {
      throw receiptsError.value;
    }
    if (!receipts) {
      throw new Error('Webhook receipts response missing');
    }

    expect(receiptsStatus).toBe(200);
    expect(Array.isArray(receipts.data)).toBe(true);

    const {
      data: metrics,
      error: metricsError,
      status: metricsStatus,
    } = await api.v1.transactions['webhook-metrics'].get({
      headers: adminHeaders,
    });

    if (metricsError) {
      throw metricsError.value;
    }
    if (!metrics) {
      throw new Error('Webhook metrics response missing');
    }

    expect(metricsStatus).toBe(200);
    expect(typeof metrics.data.totalReceived).toBe('number');
    expect(typeof metrics.data.replayed).toBe('number');
  });
});
