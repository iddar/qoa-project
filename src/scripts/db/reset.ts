import { sql } from 'drizzle-orm';

import { closeDbConnection, db } from '../../db/client';

const statements = [
  'DROP SCHEMA IF EXISTS public CASCADE',
  'CREATE SCHEMA public',
  'GRANT ALL ON SCHEMA public TO CURRENT_USER',
  'GRANT ALL ON SCHEMA public TO public',
];

const rawSql = sql as typeof sql & {
  raw: (query: string) => unknown;
};

try {
  for (const statement of statements) {
    await db.execute(rawSql.raw(statement));
  }

  console.log(`[db:reset] Schema reset complete for ${process.env.DATABASE_URL ?? 'DATABASE_URL not set'}`);
} finally {
  await closeDbConnection();
}
