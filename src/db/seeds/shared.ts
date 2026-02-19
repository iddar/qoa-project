import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import { brands, campaigns, cpgs, products, rewards, stores, users } from '../schema';
import { ensureUserUniversalWalletCard } from '../../services/wallet-onboarding';

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
  }

  console.log(`[seed:${scope}] CPG seed: ${cpgId} (Acme CPG)`);
  console.log(`[seed:${scope}] Store seed: ${storeId} (Tienda Seed)`);
  console.log(`[seed:${scope}] Brand seed: ${brandId}`);
  console.log(`[seed:${scope}] Product seed: ${productId}`);
  console.log(`[seed:${scope}] Campaign seed: ${campaignId} (qoa_seed_reto_${scope})`);
  console.log(`[seed:${scope}] Reward seed: ${rewardId}`);
  console.log(`[seed:${scope}] usuarios listos:`);
  for (const seedUser of definitions) {
    const tenant = seedUser.tenantId ? ` [tenant: ${seedUser.tenantId}]` : '';
    console.log(`- ${seedUser.role} -> ${seedUser.email} / ${seedUser.password}${tenant}`);
  }
};
