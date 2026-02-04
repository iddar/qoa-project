import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://qoa:supersecret@127.0.0.1:5432/qoa_local";

const sql = new SQL(connectionString);

export const db = drizzle(sql);

export type Database = typeof db;
