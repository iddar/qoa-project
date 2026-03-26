import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';

// Use DATABASE_URL env var
let dbUrl = process.env.DATABASE_URL ?? 'postgres://qoa:supersecret@127.0.0.1:5432/qoa_local';
// For localhost PostgreSQL: use sslmode=disable to avoid self-signed cert issues
if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) {
  dbUrl = dbUrl.replace(/[?&]sslmode=[^&]*/, '').replace(/\?$/, '');
  if (!dbUrl.includes('sslmode=')) {
    dbUrl += dbUrl.includes('?') ? '&sslmode=disable' : '?sslmode=disable';
  }
}

type DbQuery = Promise<unknown[]> & {
  from: (...args: unknown[]) => DbQuery;
  innerJoin: (...args: unknown[]) => DbQuery;
  leftJoin: (...args: unknown[]) => DbQuery;
  rightJoin: (...args: unknown[]) => DbQuery;
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

export const sqlClient = new SQL(dbUrl);

export const db = drizzle(sqlClient) as DbClient;

export async function rawQuery<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const result = await (sqlClient as { unsafe: (q: string, p: unknown[]) => Promise<{ rows?: T[] }> }).unsafe(query, params as [string, ...unknown[]]);
  return (result.rows as T[]) ?? [];
}

export async function rawQueryOne<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T | null> {
  const results = await rawQuery<T>(query, params);
  return results[0] ?? null;
}

export const closeDbConnection = async () => {
  const client = sqlClient as { close?: () => void; end?: () => Promise<void> };
  if (typeof client.close === 'function') {
    await client.close();
    return;
  }
  if (typeof client.end === 'function') {
    await client.end();
  }
};

export type Database = typeof db;
