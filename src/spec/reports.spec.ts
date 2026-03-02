import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { accumulations, campaigns, cards, cpgs, stores, transactionItems, transactions, users } from '../db/schema';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';

const app = createApp();
const api = treaty<App>(app);

const adminHeaders = {
  authorization: 'Bearer dev-token',
  'x-dev-user-id': 'dev-admin',
  'x-dev-user-role': 'qoa_admin',
};

describe('Reports module', () => {
  it('returns platform overview metrics', async () => {
    const { data, error, status } = await api.v1.reports.overview.get({
      headers: adminHeaders,
    });

    if (error) {
      throw error.value;
    }
    if (!data) {
      throw new Error('Reports overview response missing');
    }

    expect(status).toBe(200);
    expect(typeof data.data.cpgs.total).toBe('number');
    expect(typeof data.data.campaigns.active).toBe('number');
    expect(typeof data.data.transactions.total).toBe('number');
    expect(typeof data.data.reminderJobs.queued).toBe('number');
    expect(typeof data.data.whatsappMessages.total).toBe('number');
  });

  it('returns cpg and campaign summary for cpg admin in scope', async () => {
    const [cpg] = (await db
      .insert(cpgs)
      .values({
        name: `CPG reports ${crypto.randomUUID().slice(0, 6)}`,
      })
      .returning({ id: cpgs.id })) as Array<{ id: string }>;
    const [user] = (await db
      .insert(users)
      .values({
        phone: `+52155${Math.floor(Math.random() * 10_000_000)
          .toString()
          .padStart(7, '0')}`,
        email: `reports_${crypto.randomUUID()}@qoa.test`,
        role: 'consumer',
      })
      .returning({ id: users.id })) as Array<{ id: string }>;
    const [store] = (await db
      .insert(stores)
      .values({
        name: 'Store Reports CPG',
        code: `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
        type: 'tiendita',
      })
      .returning({ id: stores.id })) as Array<{ id: string }>;
    const [campaign] = (await db
      .insert(campaigns)
      .values({
        name: `Campaign Reports ${crypto.randomUUID().slice(0, 6)}`,
        cpgId: cpg?.id,
        status: 'active',
      })
      .returning({ id: campaigns.id })) as Array<{ id: string }>;
    const [card] = (await db
      .insert(cards)
      .values({
        userId: user?.id ?? '',
        campaignId: campaign?.id ?? '',
        storeId: store?.id,
        code: `card_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      })
      .returning({ id: cards.id })) as Array<{ id: string }>;

    const [transaction] = (await db
      .insert(transactions)
      .values({
        userId: user?.id ?? '',
        storeId: store?.id ?? '',
        cardId: card?.id,
        totalAmount: 145,
      })
      .returning({ id: transactions.id })) as Array<{ id: string }>;

    const [item] = (await db
      .insert(transactionItems)
      .values({
        transactionId: transaction?.id ?? '',
        productId: `sku_${crypto.randomUUID().slice(0, 8)}`,
        quantity: 1,
        amount: 145,
      })
      .returning({ id: transactionItems.id })) as Array<{ id: string }>;

    await db.insert(accumulations).values({
      cardId: card?.id ?? '',
      campaignId: campaign?.id ?? '',
      amount: 10,
      balanceAfter: 10,
      transactionItemId: item?.id ?? '',
      sourceType: 'transaction_item',
    });

    if (!cpg || !campaign || !card || !store || !user) {
      throw new Error('Failed to create report entities');
    }

    const cpgHeaders = {
      authorization: 'Bearer dev-token',
      'x-dev-user-id': 'dev-cpg-admin-reports',
      'x-dev-user-role': 'cpg_admin',
      'x-dev-tenant-id': cpg.id,
      'x-dev-tenant-type': 'cpg',
    };

    const cpgSummary = await api.v1.reports.cpgs({ cpgId: cpg.id }).summary.get({
      headers: cpgHeaders,
    });

    if (cpgSummary.error) {
      throw cpgSummary.error.value;
    }
    if (!cpgSummary.data) {
      throw new Error('CPG summary missing');
    }

    expect(cpgSummary.status).toBe(200);
    expect(cpgSummary.data.data.cpgId).toBe(cpg.id);
    expect(cpgSummary.data.data.kpis.transactions).toBeGreaterThanOrEqual(1);

    const campaignSummary = await api.v1.reports.campaigns({ campaignId: campaign.id }).summary.get({
      headers: cpgHeaders,
    });

    if (campaignSummary.error) {
      throw campaignSummary.error.value;
    }
    if (!campaignSummary.data) {
      throw new Error('Campaign summary missing');
    }

    expect(campaignSummary.status).toBe(200);
    expect(campaignSummary.data.data.campaignId).toBe(campaign.id);

    const storeHeaders = {
      authorization: 'Bearer dev-token',
      'x-dev-user-id': 'dev-store-admin-reports',
      'x-dev-user-role': 'store_admin',
      'x-dev-tenant-id': store.id,
      'x-dev-tenant-type': 'store',
    };

    const storeSummary = await api.v1.reports.stores({ storeId: store.id }).summary.get({
      headers: storeHeaders,
    });

    if (storeSummary.error) {
      throw storeSummary.error.value;
    }
    if (!storeSummary.data) {
      throw new Error('Store summary missing');
    }

    expect(storeSummary.status).toBe(200);
    expect(storeSummary.data.data.storeId).toBe(store.id);
    expect(storeSummary.data.data.kpis.transactions).toBeGreaterThanOrEqual(1);

    const forbidden = await api.v1.reports.cpgs({ cpgId: cpg.id }).summary.get({
      headers: {
        authorization: 'Bearer dev-token',
        'x-dev-user-id': 'dev-cpg-admin-foreign',
        'x-dev-user-role': 'cpg_admin',
        'x-dev-tenant-id': crypto.randomUUID(),
        'x-dev-tenant-type': 'cpg',
      },
    });

    if (!forbidden.error) {
      throw new Error('Expected forbidden for foreign cpg');
    }

    expect(forbidden.status).toBe(403);

    const storeForbidden = await api.v1.reports.stores({ storeId: store.id }).summary.get({
      headers: {
        authorization: 'Bearer dev-token',
        'x-dev-user-id': 'dev-store-admin-foreign',
        'x-dev-user-role': 'store_admin',
        'x-dev-tenant-id': crypto.randomUUID(),
        'x-dev-tenant-type': 'store',
      },
    });

    if (!storeForbidden.error) {
      throw new Error('Expected forbidden for foreign store');
    }

    expect(storeForbidden.status).toBe(403);

    await db.delete(transactions).where(eq(transactions.cardId, card.id));
    await db.delete(cards).where(eq(cards.id, card.id));
    await db.delete(campaigns).where(eq(campaigns.id, campaign.id));
    await db.delete(stores).where(eq(stores.id, store.id));
    await db.delete(users).where(eq(users.id, user.id));
    await db.delete(cpgs).where(eq(cpgs.id, cpg.id));
  });
});
