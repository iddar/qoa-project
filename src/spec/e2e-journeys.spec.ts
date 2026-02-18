import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import {
  accumulations,
  alertNotifications,
  balances,
  brands,
  campaignPolicies,
  campaigns,
  cards,
  cpgs,
  products,
  redemptions,
  reminderJobs,
  rewards,
  stores,
  transactions,
  users,
  whatsappMessages,
} from '../db/schema';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.WHATSAPP_WEBHOOK_SECRET = 'test_whatsapp_secret';

const app = createApp();
const api = treaty<App>(app);

const adminHeaders = {
  authorization: 'Bearer dev-token',
  'x-dev-user-id': 'dev-admin',
  'x-dev-user-role': 'qoa_admin',
};

const whatsappSignatureFor = (payload: unknown) =>
  createHmac('sha256', process.env.WHATSAPP_WEBHOOK_SECRET ?? '')
    .update(JSON.stringify(payload))
    .digest('hex');

const buildJourneyFixture = async (campaignStatus: 'draft' | 'active' = 'draft') => {
  const [cpg] = (await db
    .insert(cpgs)
    .values({
      name: `CPG E2E ${crypto.randomUUID().slice(0, 6)}`,
    })
    .returning({ id: cpgs.id })) as Array<{ id: string }>;

  const [brand] = (await db
    .insert(brands)
    .values({
      cpgId: cpg?.id,
      name: `Brand E2E ${crypto.randomUUID().slice(0, 6)}`,
    })
    .returning({ id: brands.id })) as Array<{ id: string }>;

  const [product] = (await db
    .insert(products)
    .values({
      brandId: brand?.id,
      sku: `SKU-E2E-${crypto.randomUUID().slice(0, 8)}`,
      name: `Product E2E ${crypto.randomUUID().slice(0, 6)}`,
    })
    .returning({ id: products.id })) as Array<{ id: string }>;

  const [campaign] = (await db
    .insert(campaigns)
    .values({
      cpgId: cpg?.id,
      name: `Campaign E2E ${crypto.randomUUID().slice(0, 6)}`,
      status: campaignStatus,
    })
    .returning({ id: campaigns.id })) as Array<{ id: string }>;

  const [user] = (await db
    .insert(users)
    .values({
      phone: `+52155${Math.floor(Math.random() * 10_000_000)
        .toString()
        .padStart(7, '0')}`,
      email: `e2e_${crypto.randomUUID()}@qoa.test`,
      role: 'consumer',
    })
    .returning({ id: users.id })) as Array<{ id: string }>;

  const [store] = (await db
    .insert(stores)
    .values({
      name: 'Store E2E',
      code: `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      type: 'tiendita',
    })
    .returning({ id: stores.id })) as Array<{ id: string }>;

  const [card] = (await db
    .insert(cards)
    .values({
      userId: user?.id ?? '',
      campaignId: campaign?.id ?? '',
      storeId: store?.id ?? '',
      code: `card_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
    })
    .returning({ id: cards.id })) as Array<{ id: string }>;

  if (!cpg || !brand || !product || !campaign || !user || !store || !card) {
    throw new Error('Failed to create e2e test fixture');
  }

  return {
    cpgId: cpg.id,
    brandId: brand.id,
    productId: product.id,
    campaignId: campaign.id,
    userId: user.id,
    storeId: store.id,
    cardId: card.id,
  };
};

describe('Critical journeys (E2E style)', () => {
  it('runs campaign lifecycle to accumulation, redemption and reporting', async () => {
    const fixture = await buildJourneyFixture();

    try {
      const policy = await api.v1.campaigns({ campaignId: fixture.campaignId }).policies.post(
        {
          policyType: 'min_amount',
          scopeType: 'campaign',
          period: 'transaction',
          value: 20,
        },
        {
          headers: adminHeaders,
        },
      );

      if (policy.error) {
        throw policy.error.value;
      }
      if (!policy.data) {
        throw new Error('Campaign policy response missing');
      }

      expect(policy.status).toBe(201);

      const readyForReview = await api.v1.campaigns({ campaignId: fixture.campaignId })['ready-for-review'].post(
        {
          reason: 'E2E transition',
        },
        {
          headers: adminHeaders,
        },
      );

      if (readyForReview.error) {
        throw readyForReview.error.value;
      }
      if (!readyForReview.data) {
        throw new Error('Ready-for-review response missing');
      }

      expect(readyForReview.status).toBe(200);

      const reviewed = await api.v1.campaigns({ campaignId: fixture.campaignId }).review.post(
        {
          approved: true,
          notes: 'E2E approval',
        },
        {
          headers: adminHeaders,
        },
      );

      if (reviewed.error) {
        throw reviewed.error.value;
      }
      if (!reviewed.data) {
        throw new Error('Review response missing');
      }

      expect(reviewed.status).toBe(200);

      const confirmed = await api.v1.campaigns({ campaignId: fixture.campaignId }).confirm.post(
        {
          notes: 'E2E confirm',
        },
        {
          headers: adminHeaders,
        },
      );

      if (confirmed.error) {
        throw confirmed.error.value;
      }
      if (!confirmed.data) {
        throw new Error('Confirm response missing');
      }

      expect(confirmed.status).toBe(200);

      const activated = await api.v1.campaigns({ campaignId: fixture.campaignId }).activate.post(undefined, {
        headers: adminHeaders,
      });

      if (activated.error) {
        throw activated.error.value;
      }
      if (!activated.data) {
        throw new Error('Activate response missing');
      }

      expect(activated.status).toBe(200);
      expect(activated.data.data.status).toBe('active');

      const reward = await api.v1.rewards.post(
        {
          campaignId: fixture.campaignId,
          name: `Reward E2E ${crypto.randomUUID().slice(0, 6)}`,
          cost: 2,
          stock: 5,
          status: 'active',
        },
        {
          headers: adminHeaders,
        },
      );

      if (reward.error) {
        throw reward.error.value;
      }
      if (!reward.data) {
        throw new Error('Reward response missing');
      }

      expect(reward.status).toBe(201);

      const tx = await api.v1.transactions.post(
        {
          userId: fixture.userId,
          storeId: fixture.storeId,
          cardId: fixture.cardId,
          idempotencyKey: `e2e-tx-${crypto.randomUUID()}`,
          items: [
            {
              productId: fixture.productId,
              quantity: 2,
              amount: 30,
            },
          ],
        },
        {
          headers: adminHeaders,
        },
      );

      if (tx.error) {
        throw tx.error.value;
      }
      if (!tx.data) {
        throw new Error('Transaction response missing');
      }

      expect(tx.status).toBe(201);
      expect(tx.data.data.accumulations.length).toBe(1);

      const redemption = await api.v1.rewards({ rewardId: reward.data.data.id }).redeem.post(
        {
          cardId: fixture.cardId,
        },
        {
          headers: adminHeaders,
        },
      );

      if (redemption.error) {
        throw redemption.error.value;
      }
      if (!redemption.data) {
        throw new Error('Redemption response missing');
      }

      expect(redemption.status).toBe(200);
      expect(redemption.data.data.card.currentBalance).toBe(0);

      const cpgHeaders = {
        authorization: 'Bearer dev-token',
        'x-dev-user-id': 'dev-cpg-admin-e2e',
        'x-dev-user-role': 'cpg_admin',
        'x-dev-tenant-id': fixture.cpgId,
        'x-dev-tenant-type': 'cpg',
      };

      const campaignSummary = await api.v1.reports.campaigns({ campaignId: fixture.campaignId }).summary.get({
        headers: cpgHeaders,
      });

      if (campaignSummary.error) {
        throw campaignSummary.error.value;
      }
      if (!campaignSummary.data) {
        throw new Error('Campaign summary response missing');
      }

      expect(campaignSummary.status).toBe(200);
      expect(campaignSummary.data.data.kpis.transactions).toBeGreaterThanOrEqual(1);
      expect(campaignSummary.data.data.kpis.accumulatedPoints).toBeGreaterThanOrEqual(2);
    } finally {
      await db.delete(redemptions).where(eq(redemptions.cardId, fixture.cardId));
      await db.delete(accumulations).where(eq(accumulations.cardId, fixture.cardId));
      await db.delete(transactions).where(eq(transactions.cardId, fixture.cardId));
      await db.delete(reminderJobs).where(eq(reminderJobs.cardId, fixture.cardId));
      await db.delete(balances).where(eq(balances.cardId, fixture.cardId));
      await db.delete(cards).where(eq(cards.id, fixture.cardId));
      await db.delete(campaignPolicies).where(eq(campaignPolicies.campaignId, fixture.campaignId));
      await db.delete(rewards).where(eq(rewards.campaignId, fixture.campaignId));
      await db.delete(campaigns).where(eq(campaigns.id, fixture.campaignId));
      await db.delete(products).where(eq(products.id, fixture.productId));
      await db.delete(brands).where(eq(brands.id, fixture.brandId));
      await db.delete(cpgs).where(eq(cpgs.id, fixture.cpgId));
      await db.delete(stores).where(eq(stores.id, fixture.storeId));
      await db.delete(users).where(eq(users.id, fixture.userId));
    }
  });

  it('covers operations journey with reminders, whatsapp webhook and alerts', async () => {
    const fixture = await buildJourneyFixture('active');

    try {
      const tx = await api.v1.transactions.post(
        {
          userId: fixture.userId,
          storeId: fixture.storeId,
          cardId: fixture.cardId,
          idempotencyKey: `e2e-ops-tx-${crypto.randomUUID()}`,
          items: [
            {
              productId: fixture.productId,
              quantity: 1,
              amount: 18,
            },
          ],
        },
        {
          headers: adminHeaders,
        },
      );

      if (tx.error) {
        throw tx.error.value;
      }

      const reminders = await api.v1.jobs.reminders.run.post(
        {
          limit: 50,
        },
        {
          headers: adminHeaders,
        },
      );

      if (reminders.error) {
        throw reminders.error.value;
      }
      if (!reminders.data) {
        throw new Error('Reminder run response missing');
      }

      expect(reminders.status).toBe(200);
      expect(reminders.data.data.queued).toBeGreaterThanOrEqual(1);

      const queuedJobs = await api.v1.jobs.reminders.get({
        query: {
          limit: '20',
        },
        headers: adminHeaders,
      });

      if (queuedJobs.error) {
        throw queuedJobs.error.value;
      }
      if (!queuedJobs.data) {
        throw new Error('Reminder list response missing');
      }

      expect(queuedJobs.status).toBe(200);
      expect(queuedJobs.data.data.some((row: { cardId: string }) => row.cardId === fixture.cardId)).toBe(true);

      const webhookPayload = {
        provider: 'meta',
        messageId: `wamid.${crypto.randomUUID()}`,
        from: '+5215511111111',
        to: '+5215522222222',
        text: 'E2E ping',
      };

      const webhookResponse = await api.v1.whatsapp.webhook.post(webhookPayload, {
        headers: {
          'x-whatsapp-signature': whatsappSignatureFor(webhookPayload),
        },
      });

      if (webhookResponse.error) {
        throw webhookResponse.error.value;
      }
      if (!webhookResponse.data) {
        throw new Error('WhatsApp webhook response missing');
      }

      expect(webhookResponse.status).toBe(201);

      const metrics = await api.v1.whatsapp.metrics.get({
        headers: adminHeaders,
      });

      if (metrics.error) {
        throw metrics.error.value;
      }
      if (!metrics.data) {
        throw new Error('WhatsApp metrics response missing');
      }

      expect(metrics.status).toBe(200);
      expect(metrics.data.data.totalReceived).toBeGreaterThanOrEqual(1);

      const notify = await api.v1.alerts.notify.post(
        {
          recipient: 'ops@qoa.local',
          minSeverity: 'high',
        },
        {
          headers: adminHeaders,
        },
      );

      if (notify.error) {
        throw notify.error.value;
      }
      if (!notify.data) {
        throw new Error('Alert notify response missing');
      }

      expect(notify.status).toBe(200);
      expect(notify.data.data.mocked).toBe(true);
      expect(notify.data.data.sent).toBeGreaterThanOrEqual(0);
    } finally {
      await db.delete(alertNotifications).where(eq(alertNotifications.recipient, 'ops@qoa.local'));
      await db.delete(whatsappMessages).where(eq(whatsappMessages.fromPhone, '+5215511111111'));
      await db.delete(reminderJobs).where(eq(reminderJobs.cardId, fixture.cardId));
      await db.delete(accumulations).where(eq(accumulations.cardId, fixture.cardId));
      await db.delete(transactions).where(eq(transactions.cardId, fixture.cardId));
      await db.delete(balances).where(eq(balances.cardId, fixture.cardId));
      await db.delete(cards).where(eq(cards.id, fixture.cardId));
      await db.delete(campaignPolicies).where(eq(campaignPolicies.campaignId, fixture.campaignId));
      await db.delete(rewards).where(eq(rewards.campaignId, fixture.campaignId));
      await db.delete(campaigns).where(eq(campaigns.id, fixture.campaignId));
      await db.delete(products).where(eq(products.id, fixture.productId));
      await db.delete(brands).where(eq(brands.id, fixture.brandId));
      await db.delete(cpgs).where(eq(cpgs.id, fixture.cpgId));
      await db.delete(stores).where(eq(stores.id, fixture.storeId));
      await db.delete(users).where(eq(users.id, fixture.userId));
    }
  });
});
