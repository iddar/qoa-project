import { describe, expect, it, beforeEach } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import {
  accumulations,
  balances,
  brands,
  campaignBalances,
  campaignStoreEnrollments,
  campaignSubscriptions,
  campaigns,
  cpgs,
  cpgStoreRelations,
  products,
  redemptions,
  stores,
  transactionItems,
  transactions,
  users,
} from '../db/schema';

type CpgRow = { id: string; name: string };
type StoreRow = { id: string; name: string; code: string };
type CampaignRow = { id: string; name: string; cpgId: string };
type EnrollmentRow = { campaignId: string; storeId: string; status: string; enrolledAt?: Date };

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

const cpgAdminHeaders = (cpgId: string) => ({
  authorization: 'Bearer dev-token',
  'x-dev-user-id': 'dev-cpg-admin',
  'x-dev-user-role': 'cpg_admin',
  'x-dev-tenant-type': 'cpg',
  'x-dev-tenant-id': cpgId,
});

const storeHeaders = (storeId: string) => ({
  authorization: 'Bearer dev-token',
  'x-dev-user-id': 'dev-store-admin',
  'x-dev-user-role': 'store_admin',
  'x-dev-tenant-type': 'store',
  'x-dev-tenant-id': storeId,
});

describe('CPG-Store Relations', () => {
  let testCpgId: string;
  let testStoreId: string;
  let testCampaignId: string;

  beforeEach(async () => {
    // Cleanup
    await db.delete(accumulations);
    await db.delete(redemptions);
    await db.delete(transactionItems);
    await db.delete(transactions);
    await db.delete(campaignBalances);
    await db.delete(balances);
    await db.delete(campaignStoreEnrollments);
    await db.delete(campaignSubscriptions);
    await db.delete(cpgStoreRelations);
    await db.delete(campaigns);
    await db.delete(products);
    await db.delete(brands);
    await db.delete(stores);
    await db.delete(cpgs);
    await db.delete(users);

    // Create CPG
    const [cpg] = (await db.insert(cpgs).values({ name: 'Test CPG' }).returning()) as CpgRow[];
    testCpgId = cpg!.id;

    // Create Store
    const [store] = (await db
      .insert(stores)
      .values({
        name: 'Test Store',
        code: `test_store_${Date.now()}`,
        type: 'tiendita',
        city: 'Ciudad de México',
        state: 'Ciudad de México',
        address: 'Av. Test 100, Centro, Ciudad de México',
        latitude: '19.4326000',
        longitude: '-99.1332000',
      })
      .returning()) as StoreRow[];
    testStoreId = store!.id;

    // Create Campaign
    const [campaign] = (await db
      .insert(campaigns)
      .values({
        name: 'Test Campaign',
        cpgId: testCpgId,
        status: 'active',
        storeAccessMode: 'selected_stores',
        storeEnrollmentMode: 'store_opt_in',
      })
      .returning()) as CampaignRow[];
    testCampaignId = campaign!.id;
  });

  it('lists related CPGs for a store', async () => {
    // Create relation
    await db.insert(cpgStoreRelations).values({
      cpgId: testCpgId,
      storeId: testStoreId,
      status: 'active',
      source: 'first_activity',
      firstActivityAt: new Date(),
      lastActivityAt: new Date(),
    });

    const { data, error } = await api.v1.stores({ storeId: testStoreId }).cpgs.get({
      headers: storeHeaders(testStoreId),
    });

    expect(error).toBeNull();
    expect(data?.data.length).toBe(1);
    expect(data?.data[0]?.id).toBe(testCpgId);
  });

  it('returns empty CPG list when no relations exist', async () => {
    const { data, error } = await api.v1.stores({ storeId: testStoreId }).cpgs.get({
      headers: storeHeaders(testStoreId),
    });

    expect(error).toBeNull();
    expect(data?.data.length).toBe(0);
  });

  it('lists related stores for a CPG with geo data', async () => {
    await db.insert(cpgStoreRelations).values({
      cpgId: testCpgId,
      storeId: testStoreId,
      status: 'active',
      source: 'manual',
      firstActivityAt: new Date(),
      lastActivityAt: new Date(),
    });

    const { data, error } = await api.v1.stores.cpgs({ cpgId: testCpgId }).stores.get({
      headers: cpgAdminHeaders(testCpgId),
    });

    expect(error).toBeNull();
    expect(data?.data.length).toBe(1);
    expect(data?.data[0]?.storeId).toBe(testStoreId);
    expect(data?.data[0]?.latitude).toBe(19.4326);
    expect(data?.data[0]?.longitude).toBe(-99.1332);
    expect(data?.data[0]?.address).toContain('Av. Test 100');
  });

  it('targets stores in a campaign', async () => {
    const { data, error } = await api.v1.campaigns({ campaignId: testCampaignId })['stores/target'].post(
      {
        storeIds: [testStoreId],
        status: 'visible',
        source: 'manual',
      },
      {
        headers: cpgAdminHeaders(testCpgId),
      },
    );

    expect(error).toBeNull();
    expect(data?.data.success).toBe(true);

    // Verify enrollment was created
    const [enrollment] = (await db
      .select()
      .from(campaignStoreEnrollments)
      .where(eq(campaignStoreEnrollments.campaignId, testCampaignId))) as EnrollmentRow[];

    expect(enrollment).toBeDefined();
    expect(enrollment?.status).toBe('visible');
    expect(enrollment?.storeId).toBe(testStoreId);
  });

  it('enrolls a store in a campaign', async () => {
    // First target the store
    await db.insert(campaignStoreEnrollments).values({
      campaignId: testCampaignId,
      storeId: testStoreId,
      status: 'visible',
      visibilitySource: 'manual',
    });

    // Then enroll
    const { data, error } = await api.v1
      .campaigns({ campaignId: testCampaignId })
      .stores({ storeId: testStoreId })
      .enroll.post(
        {
          status: 'enrolled',
        },
        {
          headers: storeHeaders(testStoreId),
        },
      );

    expect(error).toBeNull();
    expect(data?.data.status).toBe('enrolled');

    // Verify
    const [enrollment] = (await db
      .select()
      .from(campaignStoreEnrollments)
      .where(eq(campaignStoreEnrollments.campaignId, testCampaignId))) as EnrollmentRow[];

    expect(enrollment?.status).toBe('enrolled');
    expect(enrollment?.enrolledAt).toBeDefined();
  });

  it('lists stores for a campaign', async () => {
    // Target the store
    await db.insert(campaignStoreEnrollments).values({
      campaignId: testCampaignId,
      storeId: testStoreId,
      status: 'enrolled',
      visibilitySource: 'manual',
      enrollmentSource: 'store_opt_in',
      enrolledAt: new Date(),
    });

    const { data, error } = await api.v1.campaigns({ campaignId: testCampaignId }).stores.get({
      headers: cpgAdminHeaders(testCpgId),
    });

    expect(error).toBeNull();
    expect(data?.data.length).toBe(1);
    expect(data?.data[0]?.storeId).toBe(testStoreId);
    expect(data?.data[0]?.status).toBe('enrolled');
  });

  it('store operator can see visible campaigns', async () => {
    // Target and enroll the store
    await db.insert(campaignStoreEnrollments).values({
      campaignId: testCampaignId,
      storeId: testStoreId,
      status: 'enrolled',
      visibilitySource: 'manual',
      enrollmentSource: 'store_opt_in',
      enrolledAt: new Date(),
    });

    // Also create a CPG relation
    await db.insert(cpgStoreRelations).values({
      cpgId: testCpgId,
      storeId: testStoreId,
      status: 'active',
      source: 'manual',
    });

    const { data, error } = await api.v1
      .campaigns({ campaignId: testCampaignId })
      .stores({ storeId: testStoreId })
      .campaigns.get({
        headers: storeHeaders(testStoreId),
      });

    expect(error).toBeNull();
    expect(data?.data.length).toBe(1);
    expect(data?.data[0]?.id).toBe(testCampaignId);
  });

  it('store cannot see campaign without enrollment (when selected_stores)', async () => {
    // Don't enroll - just target
    await db.insert(campaignStoreEnrollments).values({
      campaignId: testCampaignId,
      storeId: testStoreId,
      status: 'visible', // visible but not enrolled
      visibilitySource: 'manual',
    });

    // Create CPG relation
    await db.insert(cpgStoreRelations).values({
      cpgId: testCpgId,
      storeId: testStoreId,
      status: 'active',
      source: 'manual',
    });

    // With selected_stores + store_opt_in, need enrolled status
    const { data, error } = await api.v1
      .campaigns({ campaignId: testCampaignId })
      .stores({ storeId: testStoreId })
      .campaigns.get({
        headers: storeHeaders(testStoreId),
      });

    // Should not return the campaign since not enrolled
    expect(data?.data.length).toBe(0);
  });
});
