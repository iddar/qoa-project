import { eq } from 'drizzle-orm';
import { db } from '../client';
import { cpgs, users } from '../schema';
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

const baseUsers = (scope: string, cpgId: string): SeedUser[] => [
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
  const definitions = baseUsers(scope, cpgId);

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
  console.log(`[seed:${scope}] usuarios listos:`);
  for (const seedUser of definitions) {
    const tenant = seedUser.tenantId ? ` [tenant: ${seedUser.tenantId}]` : '';
    console.log(`- ${seedUser.role} -> ${seedUser.email} / ${seedUser.password}${tenant}`);
  }
};
