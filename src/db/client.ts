import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';

const connectionString = process.env.DATABASE_URL ?? 'postgres://qoa:supersecret@127.0.0.1:5432/qoa_local';

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
  execute: (query: unknown) => Promise<unknown[]>;
};

export const sqlClient = new SQL(connectionString);

export const db = drizzle(sqlClient) as DbClient;

export const closeDbConnection = async () => {
  const client = sqlClient as { close?: () => void | Promise<void>; end?: () => Promise<void> };
  if (typeof client.close === 'function') {
    await client.close();
    return;
  }

  if (typeof client.end === 'function') {
    await client.end();
  }
};

export type Database = typeof db;
