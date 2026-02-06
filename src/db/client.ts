import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';

const connectionString = process.env.DATABASE_URL ?? 'postgres://qoa:supersecret@127.0.0.1:5432/qoa_local';

const sql = new SQL(connectionString);

type DbQuery = Promise<unknown[]> & {
  from: (...args: unknown[]) => DbQuery;
  where: (...args: unknown[]) => DbQuery;
  orderBy: (...args: unknown[]) => DbQuery;
  limit: (value: number) => DbQuery;
  offset: (value: number) => DbQuery;
  returning: (...args: unknown[]) => Promise<unknown[]>;
};

type DbInsert = Promise<unknown[]> & {
  values: (...args: unknown[]) => DbInsert;
  returning: (...args: unknown[]) => Promise<unknown[]>;
};

type DbUpdate = Promise<unknown[]> & {
  set: (...args: unknown[]) => DbUpdate;
  where: (...args: unknown[]) => DbUpdate;
  returning: (...args: unknown[]) => Promise<unknown[]>;
};

type DbDelete = Promise<unknown[]> & {
  where: (...args: unknown[]) => Promise<unknown[]>;
};

type DbClient = {
  select: (...args: unknown[]) => DbQuery;
  insert: (...args: unknown[]) => DbInsert;
  update: (...args: unknown[]) => DbUpdate;
  delete: (...args: unknown[]) => DbDelete;
};

export const db = drizzle(sql) as DbClient;

export type Database = typeof db;
