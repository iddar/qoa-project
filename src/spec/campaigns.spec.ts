import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { campaignPolicies, campaignSubscriptions, campaigns, users } from '../db/schema';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';

const app = createApp();
const api = treaty<App>(app);

const adminHeaders = {
  authorization: 'Bearer dev-token',
  'x-dev-user-id': 'dev-admin',
  'x-dev-user-role': 'qoa_admin',
  'x-dev-tenant-type': 'cpg',
  'x-dev-tenant-id': '11111111-1111-4111-8111-111111111111',
};

describe('Campaigns module', () => {
  it('creates campaign and runs lifecycle transitions', async () => {
    const {
      data: created,
      error: createError,
      status: createStatus,
    } = await api.v1.campaigns.post(
      {
        name: `Campana ${crypto.randomUUID().slice(0, 8)}`,
        description: 'Campana de prueba',
        cpgId: '11111111-1111-4111-8111-111111111111',
      },
      {
        headers: adminHeaders,
      },
    );

    if (createError) {
      throw createError.value;
    }
    if (!created) {
      throw new Error('Campaign creation response missing');
    }

    expect(createStatus).toBe(201);
    expect(created.data.status).toBe('draft');

    const campaignId = created.data.id;

    const {
      data: policyData,
      error: policyError,
      status: policyStatus,
    } = await api.v1.campaigns({ campaignId }).policies.post(
      {
        policyType: 'max_accumulations',
        scopeType: 'campaign',
        period: 'day',
        value: 1,
      },
      {
        headers: adminHeaders,
      },
    );

    if (policyError) {
      throw policyError.value;
    }
    if (!policyData) {
      throw new Error('Policy create response missing');
    }

    expect(policyStatus).toBe(201);
    expect(policyData.data.policyType).toBe('max_accumulations');

    const {
      data: listedPolicies,
      error: listedPoliciesError,
      status: listedPoliciesStatus,
    } = await api.v1.campaigns({ campaignId }).policies.get({
      headers: adminHeaders,
    });

    if (listedPoliciesError) {
      throw listedPoliciesError.value;
    }
    if (!listedPolicies) {
      throw new Error('Policy list response missing');
    }

    expect(listedPoliciesStatus).toBe(200);
    expect(listedPolicies.data.length).toBe(1);
    expect(listedPolicies.data[0]?.id).toBe(policyData.data.id);

    const {
      data: readyData,
      error: readyError,
      status: readyStatus,
    } = await api.v1.campaigns({ campaignId })['ready-for-review'].post(
      {
        reason: 'Lista para revision',
      },
      {
        headers: adminHeaders,
      },
    );

    if (readyError) {
      throw readyError.value;
    }
    if (!readyData) {
      throw new Error('Ready-for-review response missing');
    }

    expect(readyStatus).toBe(200);
    expect(readyData.data.status).toBe('ready_for_review');

    const {
      data: reviewedData,
      error: reviewError,
      status: reviewStatus,
    } = await api.v1.campaigns({ campaignId }).review.post(
      {
        approved: true,
        notes: 'Revision aprobada',
      },
      {
        headers: adminHeaders,
      },
    );

    if (reviewError) {
      throw reviewError.value;
    }
    if (!reviewedData) {
      throw new Error('Review response missing');
    }

    expect(reviewStatus).toBe(200);
    expect(reviewedData.data.status).toBe('in_review');

    const {
      data: confirmedData,
      error: confirmError,
      status: confirmStatus,
    } = await api.v1.campaigns({ campaignId }).confirm.post(
      {
        notes: 'QC ok',
      },
      {
        headers: adminHeaders,
      },
    );

    if (confirmError) {
      throw confirmError.value;
    }
    if (!confirmedData) {
      throw new Error('Confirm response missing');
    }

    expect(confirmStatus).toBe(200);
    expect(confirmedData.data.status).toBe('confirmed');

    const {
      data: activatedData,
      error: activateError,
      status: activateStatus,
    } = await api.v1.campaigns({ campaignId }).activate.post(undefined, {
      headers: adminHeaders,
    });

    if (activateError) {
      throw activateError.value;
    }
    if (!activatedData) {
      throw new Error('Activate response missing');
    }

    expect(activateStatus).toBe(200);
    expect(activatedData.data.status).toBe('active');

    const {
      data: auditData,
      error: auditError,
      status: auditStatus,
    } = await api.v1.campaigns({ campaignId })['audit-logs'].get({
      headers: adminHeaders,
    });

    if (auditError) {
      throw auditError.value;
    }
    if (!auditData) {
      throw new Error('Audit logs response missing');
    }

    expect(auditStatus).toBe(200);
    expect(auditData.data.length >= 4).toBe(true);

    await db.delete(campaignPolicies).where(eq(campaignPolicies.campaignId, campaignId));
    await db.delete(campaigns).where(eq(campaigns.id, campaignId));
  });

  it('lists campaigns with pagination envelope', async () => {
    const { data, error, status } = await api.v1.campaigns.get({
      query: {
        limit: '10',
      },
      headers: adminHeaders,
    });

    if (error) {
      throw error.value;
    }
    if (!data) {
      throw new Error('Campaign list response missing');
    }

    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(typeof data.pagination.hasMore).toBe('boolean');
  });

  it('creates and lists campaign tiers with rolling window rules', async () => {
    const { data: created, error: createError } = await api.v1.campaigns.post(
      {
        name: `Campaign tiers ${crypto.randomUUID().slice(0, 8)}`,
        cpgId: '11111111-1111-4111-8111-111111111111',
      },
      {
        headers: adminHeaders,
      },
    );

    if (createError) {
      throw createError.value;
    }
    if (!created) {
      throw new Error('Campaign create response missing');
    }

    const campaignId = created.data.id;
    const { data: tierData, error: tierError, status: tierStatus } = await api.v1.campaigns({ campaignId }).tiers.post(
      {
        name: 'Silver',
        order: 1,
        thresholdValue: 10,
        windowUnit: 'day',
        windowValue: 90,
        minPurchaseCount: 3,
        qualificationMode: 'any',
        graceDays: 7,
      },
      {
        headers: adminHeaders,
      },
    );

    if (tierError) {
      throw tierError.value;
    }
    if (!tierData) {
      throw new Error('Tier create response missing');
    }

    expect(tierStatus).toBe(201);
    expect(tierData.data.name).toBe('Silver');

    const { data: listData, error: listError, status: listStatus } = await api.v1.campaigns({ campaignId }).tiers.get({
      headers: adminHeaders,
    });

    if (listError) {
      throw listError.value;
    }
    if (!listData) {
      throw new Error('Tier list response missing');
    }

    expect(listStatus).toBe(200);
    expect(listData.data.length).toBe(1);
    expect(listData.data[0]?.windowValue).toBe(90);

    await db.delete(campaigns).where(eq(campaigns.id, campaignId));
  });

  it('supports wallet discovery and subscription flow', async () => {
    const [walletUser] = (await db
      .insert(users)
      .values({
        phone: `+52155${Math.floor(Math.random() * 10_000_000)
          .toString()
          .padStart(7, '0')}`,
        email: `wallet_campaign_${crypto.randomUUID()}@qoa.test`,
        role: 'consumer',
      })
      .returning({ id: users.id })) as Array<{ id: string }>;

    if (!walletUser) {
      throw new Error('Failed to create wallet user');
    }

    const [campaign] = (await db
      .insert(campaigns)
      .values({
        name: `Campaign Discover ${crypto.randomUUID().slice(0, 6)}`,
        status: 'active',
        enrollmentMode: 'opt_in',
        startsAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: campaigns.id })) as Array<{ id: string }>;

    if (!campaign) {
      throw new Error('Failed to create campaign');
    }

    await db.insert(campaignPolicies).values({
      campaignId: campaign.id,
      policyType: 'min_amount',
      scopeType: 'campaign',
      period: 'transaction',
      value: 100,
      active: true,
      updatedAt: new Date(),
    });

    const walletHeaders = {
      authorization: 'Bearer dev-token',
      'x-dev-user-id': walletUser.id,
      'x-dev-user-role': 'consumer',
    };

    const discover = await api.v1.campaigns.discover.get({
      headers: walletHeaders,
    });

    if (discover.error) {
      throw discover.error.value;
    }
    if (!discover.data) {
      throw new Error('Campaign discover response missing');
    }

    expect(discover.status).toBe(200);
    const discoveredCampaign = discover.data.data.find((item: { id: string }) => item.id === campaign.id);
    expect(discoveredCampaign).toBeTruthy();
    expect((discoveredCampaign as { daysRemaining?: number }).daysRemaining).toBeGreaterThan(0);
    expect(((discoveredCampaign as { policySummaries?: Array<{ label: string }> }).policySummaries ?? []).length).toBeGreaterThan(0);

    const subscribe = await api.v1.campaigns({ campaignId: campaign.id }).subscribe.post(undefined, {
      headers: walletHeaders,
    });

    if (subscribe.error) {
      throw subscribe.error.value;
    }
    if (!subscribe.data) {
      throw new Error('Campaign subscribe response missing');
    }

    expect(subscribe.status).toBe(200);
    expect(subscribe.data.data.status).toBe('subscribed');

    const mine = await api.v1.campaigns.subscriptions.me.get({
      headers: walletHeaders,
    });

    if (mine.error) {
      throw mine.error.value;
    }
    if (!mine.data) {
      throw new Error('Campaign subscriptions response missing');
    }

    expect(mine.status).toBe(200);
    const subscribedCampaign = mine.data.data.find((item: { campaignId: string }) => item.campaignId === campaign.id) as
      | { status: string; policySummaries?: Array<{ label: string }>; daysRemaining?: number }
      | undefined;
    expect(subscribedCampaign?.status).toBe('subscribed');
    expect((subscribedCampaign?.policySummaries ?? []).length).toBeGreaterThan(0);
    expect(subscribedCampaign?.daysRemaining).toBeGreaterThan(0);

    await db.delete(campaignSubscriptions).where(eq(campaignSubscriptions.userId, walletUser.id));
    await db.delete(campaignPolicies).where(eq(campaignPolicies.campaignId, campaign.id));
    await db.delete(campaigns).where(eq(campaigns.id, campaign.id));
    await db.delete(users).where(eq(users.id, walletUser.id));
  });
});
