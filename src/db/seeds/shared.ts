import { eq } from 'drizzle-orm';
import { db } from '../client';
import { users } from '../schema';

type SeedUser = {
  email: string;
  phone: string;
  name: string;
  role: 'consumer' | 'customer' | 'store_staff' | 'store_admin' | 'cpg_admin' | 'qoa_support' | 'qoa_admin';
  password: string;
};

const DEFAULT_PASSWORD = 'Password123!';

const baseUsers = (scope: string): SeedUser[] => [
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
];

export const seedUsers = async (scope: 'development' | 'local' | 'test') => {
  const definitions = baseUsers(scope);

  for (const seedUser of definitions) {
    const passwordHash = await Bun.password.hash(seedUser.password);
    const [existing] = (await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, seedUser.email))
      .limit(1)) as Array<{ id: string }>;

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
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
      continue;
    }

    await db.insert(users).values({
      email: seedUser.email,
      phone: seedUser.phone,
      name: seedUser.name,
      role: seedUser.role,
      passwordHash,
      status: 'active',
    });
  }

  console.log(`[seed:${scope}] usuarios listos:`);
  for (const seedUser of definitions) {
    console.log(`- ${seedUser.role} -> ${seedUser.email} / ${seedUser.password}`);
  }
};
