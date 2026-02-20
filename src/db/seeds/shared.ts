import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import {
  accumulations,
  balances,
  brands,
  campaignBalances,
  campaignPolicies,
  campaignSubscriptions,
  campaigns,
  cpgs,
  products,
  redemptions,
  rewards,
  stores,
  transactionItems,
  transactions,
  users,
} from '../schema';
import { ensureUserUniversalWalletCard } from '../../services/wallet-onboarding';
import { UNIVERSAL_CAMPAIGN_KEY } from '../../services/wallet-onboarding';

type SeedUser = {
  email: string;
  phone: string;
  name: string;
  role: 'consumer' | 'customer' | 'store_staff' | 'store_admin' | 'cpg_admin' | 'qoa_support' | 'qoa_admin';
  password: string;
  tenantId?: string;
  tenantType?: 'cpg' | 'store';
};

const DEFAULT_PASSWORD = 'Password123!';

const upsertSeedStore = async (scope: string): Promise<string> => {
  const code = `seed_store_${scope}`;
  const name = `Tienda Seed (${scope})`;

  const [existing] = (await db.select({ id: stores.id }).from(stores).where(eq(stores.code, code)).limit(1)) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(stores)
      .set({
        name,
        type: 'tiendita',
        address: `Zona seed ${scope}`,
        phone: `+52155888000${scope === 'test' ? '01' : scope === 'local' ? '02' : '03'}`,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(stores.id, existing.id));
    return existing.id;
  }

  const [inserted] = (await db
    .insert(stores)
    .values({
      code,
      name,
      type: 'tiendita',
      address: `Zona seed ${scope}`,
      phone: `+52155888000${scope === 'test' ? '01' : scope === 'local' ? '02' : '03'}`,
      status: 'active',
    })
    .returning({ id: stores.id })) as Array<{ id: string }>;

  return inserted!.id;
};

const upsertSeedBrand = async (scope: string, cpgId: string): Promise<string> => {
  const name = `Brand Seed (${scope})`;

  const [existing] = (await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.cpgId, cpgId), eq(brands.name, name)))
    .limit(1)) as Array<{ id: string }>;

  if (existing) {
    await db.update(brands).set({ status: 'active', updatedAt: new Date() }).where(eq(brands.id, existing.id));
    return existing.id;
  }

  const [inserted] = (await db
    .insert(brands)
    .values({
      cpgId,
      name,
      status: 'active',
    })
    .returning({ id: brands.id })) as Array<{ id: string }>;

  return inserted!.id;
};

const upsertSeedProduct = async (scope: string, brandId: string): Promise<string> => {
  const sku = `SEED-${scope.toUpperCase()}-001`;

  const [existing] = (await db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).limit(1)) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(products)
      .set({
        brandId,
        name: `Producto Seed (${scope})`,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(products.id, existing.id));
    return existing.id;
  }

  const [inserted] = (await db
    .insert(products)
    .values({
      brandId,
      sku,
      name: `Producto Seed (${scope})`,
      status: 'active',
    })
    .returning({ id: products.id })) as Array<{ id: string }>;

  return inserted!.id;
};

const upsertSeedCampaign = async (scope: string, cpgId: string): Promise<string> => {
  const key = `qoa_seed_reto_${scope}`;

  const [existing] = (await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.key, key)).limit(1)) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(campaigns)
      .set({
        name: `Reto Seed (${scope})`,
        description: 'Campaña de prueba para wallet/rewards en entorno local.',
        cpgId,
        status: 'active',
        enrollmentMode: 'opt_in',
        startsAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, existing.id));
    return existing.id;
  }

  const [inserted] = (await db
    .insert(campaigns)
    .values({
      key,
      name: `Reto Seed (${scope})`,
      description: 'Campaña de prueba para wallet/rewards en entorno local.',
      cpgId,
      status: 'active',
      enrollmentMode: 'opt_in',
      startsAt: new Date(),
    })
    .returning({ id: campaigns.id })) as Array<{ id: string }>;

  return inserted!.id;
};

const upsertSeedReward = async (scope: string, campaignId: string): Promise<string> => {
  const name = `Recompensa Seed (${scope})`;

  const [existing] = (await db
    .select({ id: rewards.id })
    .from(rewards)
    .where(and(eq(rewards.campaignId, campaignId), eq(rewards.name, name)))
    .limit(1)) as Array<{ id: string }>;

  if (existing) {
    await db
      .update(rewards)
      .set({
        cost: 10,
        stock: 100,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(rewards.id, existing.id));
    return existing.id;
  }

  const [inserted] = (await db
    .insert(rewards)
    .values({
      campaignId,
      name,
      description: 'Recompensa seed para pruebas funcionales.',
      cost: 10,
      stock: 100,
      status: 'active',
      updatedAt: new Date(),
    })
    .returning({ id: rewards.id })) as Array<{ id: string }>;

  return inserted!.id;
};

const upsertStoreByCode = async (payload: {
  code: string;
  name: string;
  type: string;
  address: string;
  phone: string;
}): Promise<string> => {
  const [existing] = (await db.select({ id: stores.id }).from(stores).where(eq(stores.code, payload.code)).limit(1)) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(stores)
      .set({
        name: payload.name,
        type: payload.type,
        address: payload.address,
        phone: payload.phone,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(stores.id, existing.id));
    return existing.id;
  }

  const [created] = (await db
    .insert(stores)
    .values({
      code: payload.code,
      name: payload.name,
      type: payload.type,
      address: payload.address,
      phone: payload.phone,
      status: 'active',
    })
    .returning({ id: stores.id })) as Array<{ id: string }>;

  return created!.id;
};

const upsertBrandByName = async (cpgId: string, name: string): Promise<string> => {
  const [existing] = (await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.cpgId, cpgId), eq(brands.name, name)))
    .limit(1)) as Array<{ id: string }>;

  if (existing) {
    await db.update(brands).set({ status: 'active', updatedAt: new Date() }).where(eq(brands.id, existing.id));
    return existing.id;
  }

  const [created] = (await db
    .insert(brands)
    .values({
      cpgId,
      name,
      status: 'active',
    })
    .returning({ id: brands.id })) as Array<{ id: string }>;

  return created!.id;
};

const upsertProductBySku = async (brandId: string, sku: string, name: string): Promise<string> => {
  const [existing] = (await db.select({ id: products.id }).from(products).where(eq(products.sku, sku)).limit(1)) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(products)
      .set({
        brandId,
        name,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(products.id, existing.id));
    return existing.id;
  }

  const [created] = (await db
    .insert(products)
    .values({
      brandId,
      sku,
      name,
      status: 'active',
    })
    .returning({ id: products.id })) as Array<{ id: string }>;

  return created!.id;
};

const upsertCampaignByKey = async (payload: {
  key: string;
  name: string;
  description: string;
  cpgId: string;
  enrollmentMode: 'open' | 'opt_in' | 'system_universal';
  status: string;
}): Promise<string> => {
  const [existing] = (await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.key, payload.key)).limit(1)) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(campaigns)
      .set({
        name: payload.name,
        description: payload.description,
        cpgId: payload.cpgId,
        status: payload.status,
        enrollmentMode: payload.enrollmentMode,
        startsAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, existing.id));
    return existing.id;
  }

  const [created] = (await db
    .insert(campaigns)
    .values({
      key: payload.key,
      name: payload.name,
      description: payload.description,
      cpgId: payload.cpgId,
      status: payload.status,
      enrollmentMode: payload.enrollmentMode,
      startsAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    })
    .returning({ id: campaigns.id })) as Array<{ id: string }>;

  return created!.id;
};

const upsertRewardByName = async (payload: {
  campaignId: string;
  name: string;
  description: string;
  cost: number;
  stock: number;
}): Promise<string> => {
  const [existing] = (await db
    .select({ id: rewards.id })
    .from(rewards)
    .where(and(eq(rewards.campaignId, payload.campaignId), eq(rewards.name, payload.name)))
    .limit(1)) as Array<{ id: string }>;

  if (existing) {
    await db
      .update(rewards)
      .set({
        description: payload.description,
        cost: payload.cost,
        stock: payload.stock,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(rewards.id, existing.id));
    return existing.id;
  }

  const [created] = (await db
    .insert(rewards)
    .values({
      campaignId: payload.campaignId,
      name: payload.name,
      description: payload.description,
      cost: payload.cost,
      stock: payload.stock,
      status: 'active',
      updatedAt: new Date(),
    })
    .returning({ id: rewards.id })) as Array<{ id: string }>;

  return created!.id;
};

const ensurePolicy = async (payload: {
  campaignId: string;
  policyType: 'max_accumulations' | 'min_amount' | 'min_quantity' | 'cooldown';
  scopeType: 'campaign' | 'brand' | 'product';
  period: 'transaction' | 'day' | 'week' | 'month' | 'lifetime';
  value: number;
}) => {
  const [existing] = (await db
    .select({ id: campaignPolicies.id })
    .from(campaignPolicies)
    .where(
      and(
        eq(campaignPolicies.campaignId, payload.campaignId),
        eq(campaignPolicies.policyType, payload.policyType),
        eq(campaignPolicies.scopeType, payload.scopeType),
        eq(campaignPolicies.period, payload.period),
      ),
    )
    .limit(1)) as Array<{ id: string }>;

  if (existing) {
    await db
      .update(campaignPolicies)
      .set({
        value: payload.value,
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(campaignPolicies.id, existing.id));
    return;
  }

  await db.insert(campaignPolicies).values({
    campaignId: payload.campaignId,
    policyType: payload.policyType,
    scopeType: payload.scopeType,
    period: payload.period,
    value: payload.value,
    active: true,
    updatedAt: new Date(),
  });
};

/**
 * Upsert a seed CPG and return its id.
 * Uses the CPG name as the stable identity key.
 */
const upsertSeedCpg = async (scope: string): Promise<string> => {
  const name = `Acme CPG (${scope})`;

  const [existing] = (await db.select({ id: cpgs.id }).from(cpgs).where(eq(cpgs.name, name)).limit(1)) as Array<{
    id: string;
  }>;

  if (existing) {
    await db.update(cpgs).set({ status: 'active', updatedAt: new Date() }).where(eq(cpgs.id, existing.id));
    return existing.id;
  }

  const [inserted] = (await db.insert(cpgs).values({ name, status: 'active' }).returning({ id: cpgs.id })) as Array<{
    id: string;
  }>;

  return inserted!.id;
};

const ensureSubscribed = async (userId: string, campaignId: string) => {
  const [existing] = (await db
    .select({ id: campaignSubscriptions.id })
    .from(campaignSubscriptions)
    .where(and(eq(campaignSubscriptions.userId, userId), eq(campaignSubscriptions.campaignId, campaignId)))) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(campaignSubscriptions)
      .set({
        status: 'subscribed',
        subscribedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaignSubscriptions.id, existing.id));
    return;
  }

  await db.insert(campaignSubscriptions).values({
    userId,
    campaignId,
    status: 'subscribed',
    subscribedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
};

const addPoints = async (payload: {
  cardId: string;
  campaignId: string;
  transactionItemId: string;
  amount: number;
  createdAt: Date;
  balanceState: { current: number; lifetime: number };
  campaignState: Map<string, { current: number; lifetime: number }>;
}) => {
  payload.balanceState.current += payload.amount;
  payload.balanceState.lifetime += payload.amount;

  const campaignCurrent = payload.campaignState.get(payload.campaignId) ?? { current: 0, lifetime: 0 };
  campaignCurrent.current += payload.amount;
  campaignCurrent.lifetime += payload.amount;
  payload.campaignState.set(payload.campaignId, campaignCurrent);

  await db.insert(accumulations).values({
    transactionItemId: payload.transactionItemId,
    cardId: payload.cardId,
    campaignId: payload.campaignId,
    amount: payload.amount,
    balanceAfter: campaignCurrent.current,
    sourceType: 'transaction_item',
    createdAt: payload.createdAt,
  });

  const [existingCampaignBalance] = (await db
    .select({ id: campaignBalances.id })
    .from(campaignBalances)
    .where(and(eq(campaignBalances.cardId, payload.cardId), eq(campaignBalances.campaignId, payload.campaignId)))) as Array<{
    id: string;
  }>;

  if (existingCampaignBalance) {
    await db
      .update(campaignBalances)
      .set({
        current: campaignCurrent.current,
        lifetime: campaignCurrent.lifetime,
        updatedAt: payload.createdAt,
      })
      .where(eq(campaignBalances.id, existingCampaignBalance.id));
  } else {
    await db.insert(campaignBalances).values({
      cardId: payload.cardId,
      campaignId: payload.campaignId,
      current: campaignCurrent.current,
      lifetime: campaignCurrent.lifetime,
      updatedAt: payload.createdAt,
    });
  }

  const [existingBalance] = (await db
    .select({ id: balances.id })
    .from(balances)
    .where(eq(balances.cardId, payload.cardId))) as Array<{ id: string }>;

  if (existingBalance) {
    await db
      .update(balances)
      .set({
        current: payload.balanceState.current,
        lifetime: payload.balanceState.lifetime,
        updatedAt: payload.createdAt,
      })
      .where(eq(balances.id, existingBalance.id));
  } else {
    await db.insert(balances).values({
      cardId: payload.cardId,
      current: payload.balanceState.current,
      lifetime: payload.balanceState.lifetime,
      updatedAt: payload.createdAt,
    });
  }
};

const seedDemoActivity = async (payload: {
  scope: 'development' | 'local';
  consumerUserId: string;
  consumerCardId: string;
  primaryStoreId: string;
  secondaryStoreId: string;
  productIds: string[];
  universalCampaignId: string;
  retoCampaignId: string;
  openCampaignId: string;
  rewardIds: string[];
}) => {
  const seedPrefix = `seed:${payload.scope}:demo:tx:`;
  const existingSeedTxRows = (await db
    .select({ idempotencyKey: transactions.idempotencyKey })
    .from(transactions)
    .where(eq(transactions.userId, payload.consumerUserId))) as Array<{ idempotencyKey: string | null }>;
  const existingSeedKeys = new Set(
    existingSeedTxRows
      .map((row) => row.idempotencyKey)
      .filter((value): value is string => typeof value === 'string' && value.startsWith(seedPrefix)),
  );

  const [balanceRow] = (await db
    .select({ current: balances.current, lifetime: balances.lifetime })
    .from(balances)
    .where(eq(balances.cardId, payload.consumerCardId))) as Array<{ current: number; lifetime: number }>;
  const balanceState = {
    current: balanceRow?.current ?? 0,
    lifetime: balanceRow?.lifetime ?? 0,
  };

  const campaignRows = (await db
    .select({ campaignId: campaignBalances.campaignId, current: campaignBalances.current, lifetime: campaignBalances.lifetime })
    .from(campaignBalances)
    .where(eq(campaignBalances.cardId, payload.consumerCardId))) as Array<{ campaignId: string; current: number; lifetime: number }>;
  const campaignState = new Map<string, { current: number; lifetime: number }>();
  for (const row of campaignRows) {
    campaignState.set(row.campaignId, {
      current: row.current,
      lifetime: row.lifetime,
    });
  }

  const now = Date.now();
  for (let dayOffset = 29; dayOffset >= 0; dayOffset -= 1) {
    const txPerDay = dayOffset % 3 === 0 ? 3 : dayOffset % 2 === 0 ? 2 : 1;

    for (let txIndex = 0; txIndex < txPerDay; txIndex += 1) {
      const idempotencyKey = `${seedPrefix}${dayOffset}:${txIndex}`;
      if (existingSeedKeys.has(idempotencyKey)) {
        continue;
      }

      const createdAt = new Date(now - dayOffset * 24 * 60 * 60 * 1000);
      createdAt.setUTCHours(10 + txIndex * 3, (dayOffset * 7) % 60, 0, 0);

      const storeId = (dayOffset + txIndex) % 4 === 0 ? payload.secondaryStoreId : payload.primaryStoreId;
      const productId = payload.productIds[(dayOffset + txIndex) % payload.productIds.length] ?? payload.productIds[0];
      const quantity = (dayOffset + txIndex) % 5 === 0 ? 2 : 1;
      const amount = 55 + ((dayOffset * 11 + txIndex * 17) % 150);
      const totalAmount = amount * quantity;

      const [tx] = (await db
        .insert(transactions)
        .values({
          userId: payload.consumerUserId,
          storeId,
          cardId: payload.consumerCardId,
          idempotencyKey,
          totalAmount,
          metadata: `demo seed ${payload.scope}`,
          createdAt,
        })
        .returning({ id: transactions.id })) as Array<{ id: string }>;

      if (!tx) {
        continue;
      }

      const [item] = (await db
        .insert(transactionItems)
        .values({
          transactionId: tx.id,
          productId,
          quantity,
          amount,
          metadata: 'seed demo item',
        })
        .returning({ id: transactionItems.id })) as Array<{ id: string }>;

      if (!item) {
        continue;
      }

      const points = Math.max(8, Math.round(totalAmount / 12));
      await addPoints({
        cardId: payload.consumerCardId,
        campaignId: payload.universalCampaignId,
        transactionItemId: item.id,
        amount: points,
        createdAt,
        balanceState,
        campaignState,
      });

      if ((dayOffset + txIndex) % 2 === 0) {
        await addPoints({
          cardId: payload.consumerCardId,
          campaignId: payload.retoCampaignId,
          transactionItemId: item.id,
          amount: Math.max(4, Math.round(points * 0.8)),
          createdAt,
          balanceState,
          campaignState,
        });
      }

      if ((dayOffset + txIndex) % 3 === 0) {
        await addPoints({
          cardId: payload.consumerCardId,
          campaignId: payload.openCampaignId,
          transactionItemId: item.id,
          amount: Math.max(3, Math.round(points * 0.6)),
          createdAt,
          balanceState,
          campaignState,
        });
      }
    }
  }

  const existingRedemptionRows = (await db
    .select({ id: redemptions.id })
    .from(redemptions)
    .where(and(eq(redemptions.cardId, payload.consumerCardId), eq(redemptions.status, 'completed')))) as Array<{
    id: string;
  }>;
  const skipRedemptions = existingRedemptionRows.length >= 6;

  if (!skipRedemptions) {
    const rewardIdsSet = new Set(payload.rewardIds);
    const rewardRows = (await db
      .select({ id: rewards.id, campaignId: rewards.campaignId, cost: rewards.cost, stock: rewards.stock })
      .from(rewards)) as Array<{
      id: string;
      campaignId: string;
      cost: number;
      stock: number | null;
    }>;
    const filteredRewards = rewardRows.filter((row) => rewardIdsSet.has(row.id));

    for (let index = 0; index < Math.min(8, filteredRewards.length * 2); index += 1) {
      const reward = filteredRewards[index % filteredRewards.length];
      if (!reward) {
        continue;
      }

      const campaignCurrent = campaignState.get(reward.campaignId)?.current ?? 0;
      if (campaignCurrent < reward.cost + 5) {
        continue;
      }

      const createdAt = new Date(now - (index + 1) * 3 * 24 * 60 * 60 * 1000);
      await db.insert(redemptions).values({
        cardId: payload.consumerCardId,
        rewardId: reward.id,
        cost: reward.cost,
        status: 'completed',
        createdAt,
        completedAt: createdAt,
      });

      campaignState.set(reward.campaignId, {
        current: campaignCurrent - reward.cost,
        lifetime: campaignState.get(reward.campaignId)?.lifetime ?? campaignCurrent,
      });
      balanceState.current -= reward.cost;

      const [existingCampaignBalance] = (await db
        .select({ id: campaignBalances.id })
        .from(campaignBalances)
        .where(
          and(eq(campaignBalances.cardId, payload.consumerCardId), eq(campaignBalances.campaignId, reward.campaignId)),
        )) as Array<{ id: string }>;

      if (existingCampaignBalance) {
        await db
          .update(campaignBalances)
          .set({
            current: campaignCurrent - reward.cost,
            lifetime: campaignState.get(reward.campaignId)?.lifetime ?? campaignCurrent,
            updatedAt: createdAt,
          })
          .where(eq(campaignBalances.id, existingCampaignBalance.id));
      } else {
        await db.insert(campaignBalances).values({
          cardId: payload.consumerCardId,
          campaignId: reward.campaignId,
          current: campaignCurrent - reward.cost,
          lifetime: campaignState.get(reward.campaignId)?.lifetime ?? campaignCurrent,
          updatedAt: createdAt,
        });
      }

      const [existingBalance] = (await db
        .select({ id: balances.id })
        .from(balances)
        .where(eq(balances.cardId, payload.consumerCardId))) as Array<{ id: string }>;

      if (existingBalance) {
        await db
          .update(balances)
          .set({
            current: balanceState.current,
            lifetime: balanceState.lifetime,
            updatedAt: createdAt,
          })
          .where(eq(balances.id, existingBalance.id));
      } else {
        await db.insert(balances).values({
          cardId: payload.consumerCardId,
          current: balanceState.current,
          lifetime: balanceState.lifetime,
          updatedAt: createdAt,
        });
      }

      if (typeof reward.stock === 'number') {
        await db
          .update(rewards)
          .set({
            stock: Math.max(0, reward.stock - 1),
            updatedAt: createdAt,
          })
          .where(eq(rewards.id, reward.id));
      }
    }
  }
};

const baseUsers = (scope: string, cpgId: string, storeId: string): SeedUser[] => [
  {
    email: `admin.${scope}@qoa.local`,
    phone: `+52155100000${scope === 'test' ? '01' : scope === 'local' ? '02' : '03'}`,
    name: `Qoa Admin (${scope})`,
    role: 'qoa_admin',
    password: DEFAULT_PASSWORD,
  },
  {
    email: `support.${scope}@qoa.local`,
    phone: `+52155100000${scope === 'test' ? '11' : scope === 'local' ? '12' : '13'}`,
    name: `Qoa Support (${scope})`,
    role: 'qoa_support',
    password: DEFAULT_PASSWORD,
  },
  {
    email: `store.${scope}@qoa.local`,
    phone: `+52155100000${scope === 'test' ? '21' : scope === 'local' ? '22' : '23'}`,
    name: `Store Admin (${scope})`,
    role: 'store_admin',
    password: DEFAULT_PASSWORD,
    tenantId: storeId,
    tenantType: 'store',
  },
  {
    email: `consumer.${scope}@qoa.local`,
    phone: `+52155100000${scope === 'test' ? '31' : scope === 'local' ? '32' : '33'}`,
    name: `Consumer (${scope})`,
    role: 'consumer',
    password: DEFAULT_PASSWORD,
  },
  {
    email: `cpg.${scope}@qoa.local`,
    phone: `+52155100000${scope === 'test' ? '41' : scope === 'local' ? '42' : '43'}`,
    name: `CPG Admin (${scope})`,
    role: 'cpg_admin',
    password: DEFAULT_PASSWORD,
    tenantId: cpgId,
    tenantType: 'cpg',
  },
];

export const seedUsers = async (scope: 'development' | 'local' | 'test') => {
  const cpgId = await upsertSeedCpg(scope);
  const storeId = await upsertSeedStore(scope);
  const brandId = await upsertSeedBrand(scope, cpgId);
  const productId = await upsertSeedProduct(scope, brandId);
  const campaignId = await upsertSeedCampaign(scope, cpgId);
  const rewardId = await upsertSeedReward(scope, campaignId);
  const definitions = baseUsers(scope, cpgId, storeId);
  const userIdsByEmail = new Map<string, string>();

  for (const seedUser of definitions) {
    const passwordHash = await Bun.password.hash(seedUser.password);
    const [existing] = (await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, seedUser.email))
      .limit(1)) as Array<{ id: string }>;

    let userId = existing?.id ?? null;

    if (existing) {
      await db
        .update(users)
        .set({
          phone: seedUser.phone,
          name: seedUser.name,
          role: seedUser.role,
          passwordHash,
          status: 'active',
          blockedAt: null,
          blockedUntil: null,
          blockedReason: null,
          tenantId: seedUser.tenantId ?? null,
          tenantType: seedUser.tenantType ?? null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
      userId = existing.id;
    } else {
      const [inserted] = (await db
        .insert(users)
        .values({
          email: seedUser.email,
          phone: seedUser.phone,
          name: seedUser.name,
          role: seedUser.role,
          passwordHash,
          status: 'active',
          tenantId: seedUser.tenantId,
          tenantType: seedUser.tenantType,
        })
        .returning({ id: users.id })) as Array<{ id: string }>;

      userId = inserted?.id ?? null;
    }

    if (userId && (seedUser.role === 'consumer' || seedUser.role === 'customer')) {
      await ensureUserUniversalWalletCard(userId);
    }

    if (userId) {
      userIdsByEmail.set(seedUser.email, userId);
    }
  }

  if (scope === 'development' || scope === 'local') {
    const secondaryStoreId = await upsertStoreByCode({
      code: `seed_store_b_${scope}`,
      name: `Tienda Seed B (${scope})`,
      type: 'superette',
      address: `Zona seed B ${scope}`,
      phone: `+52155899000${scope === 'local' ? '12' : '13'}`,
    });

    const brandIds = [
      await upsertBrandByName(cpgId, `Brand Plus (${scope})`),
      await upsertBrandByName(cpgId, `Brand Max (${scope})`),
      await upsertBrandByName(cpgId, `Brand Flex (${scope})`),
    ];

    const productIds = [
      productId,
      await upsertProductBySku(brandIds[0]!, `SEED-${scope.toUpperCase()}-002`, `Producto Plus 2 (${scope})`),
      await upsertProductBySku(brandIds[1]!, `SEED-${scope.toUpperCase()}-003`, `Producto Max 3 (${scope})`),
      await upsertProductBySku(brandIds[2]!, `SEED-${scope.toUpperCase()}-004`, `Producto Flex 4 (${scope})`),
      await upsertProductBySku(brandIds[0]!, `SEED-${scope.toUpperCase()}-005`, `Producto Plus 5 (${scope})`),
      await upsertProductBySku(brandIds[1]!, `SEED-${scope.toUpperCase()}-006`, `Producto Max 6 (${scope})`),
    ];

    const openCampaignId = await upsertCampaignByKey({
      key: `qoa_seed_open_${scope}`,
      name: `Campaña Open Seed (${scope})`,
      description: 'Campaña abierta para demo de acumulaciones adicionales.',
      cpgId,
      enrollmentMode: 'open',
      status: 'active',
    });

    const flashCampaignId = await upsertCampaignByKey({
      key: `qoa_seed_flash_${scope}`,
      name: `Campaña Flash Seed (${scope})`,
      description: 'Campaña de temporada para demostrar variantes de rewards.',
      cpgId,
      enrollmentMode: 'opt_in',
      status: 'active',
    });

    const rewardIds = [
      rewardId,
      await upsertRewardByName({
        campaignId,
        name: `Cupón 2x1 Seed (${scope})`,
        description: 'Cupón promocional para demos de canje.',
        cost: 30,
        stock: 120,
      }),
      await upsertRewardByName({
        campaignId: openCampaignId,
        name: `Reward Open Plus (${scope})`,
        description: 'Reward activa para campaña abierta.',
        cost: 20,
        stock: 140,
      }),
      await upsertRewardByName({
        campaignId: openCampaignId,
        name: `Reward Open Max (${scope})`,
        description: 'Reward adicional para demostrar variedad.',
        cost: 45,
        stock: 90,
      }),
      await upsertRewardByName({
        campaignId: flashCampaignId,
        name: `Reward Flash (${scope})`,
        description: 'Reward de campaña flash.',
        cost: 25,
        stock: 80,
      }),
    ];

    await ensurePolicy({
      campaignId,
      policyType: 'min_amount',
      scopeType: 'campaign',
      period: 'transaction',
      value: 80,
    });
    await ensurePolicy({
      campaignId,
      policyType: 'max_accumulations',
      scopeType: 'campaign',
      period: 'day',
      value: 3,
    });
    await ensurePolicy({
      campaignId: openCampaignId,
      policyType: 'min_quantity',
      scopeType: 'campaign',
      period: 'transaction',
      value: 2,
    });
    await ensurePolicy({
      campaignId: openCampaignId,
      policyType: 'cooldown',
      scopeType: 'campaign',
      period: 'day',
      value: 1,
    });
    await ensurePolicy({
      campaignId: flashCampaignId,
      policyType: 'min_amount',
      scopeType: 'campaign',
      period: 'transaction',
      value: 120,
    });

    const consumerEmail = `consumer.${scope}@qoa.local`;
    const consumerUserId = userIdsByEmail.get(consumerEmail);
    if (consumerUserId) {
      const ensuredCard = await ensureUserUniversalWalletCard(consumerUserId);
      await ensureSubscribed(consumerUserId, campaignId);
      await ensureSubscribed(consumerUserId, flashCampaignId);

      const [universal] = (await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.key, UNIVERSAL_CAMPAIGN_KEY))) as Array<{ id: string }>;

      if (universal?.id) {
        await seedDemoActivity({
          scope,
          consumerUserId,
          consumerCardId: ensuredCard.cardId,
          primaryStoreId: storeId,
          secondaryStoreId,
          productIds,
          universalCampaignId: universal.id,
          retoCampaignId: campaignId,
          openCampaignId,
          rewardIds,
        });
      }
    }
  }

  console.log(`[seed:${scope}] CPG seed: ${cpgId} (Acme CPG)`);
  console.log(`[seed:${scope}] Store seed: ${storeId} (Tienda Seed)`);
  console.log(`[seed:${scope}] Brand seed: ${brandId}`);
  console.log(`[seed:${scope}] Product seed: ${productId}`);
  console.log(`[seed:${scope}] Campaign seed: ${campaignId} (qoa_seed_reto_${scope})`);
  console.log(`[seed:${scope}] Reward seed: ${rewardId}`);
  if (scope === 'development' || scope === 'local') {
    console.log(`[seed:${scope}] Demo data: 30 días de transacciones + campañas/recompensas extra`);
  }
  console.log(`[seed:${scope}] usuarios listos:`);
  for (const seedUser of definitions) {
    const tenant = seedUser.tenantId ? ` [tenant: ${seedUser.tenantId}]` : '';
    console.log(`- ${seedUser.role} -> ${seedUser.email} / ${seedUser.password}${tenant}`);
  }
};
