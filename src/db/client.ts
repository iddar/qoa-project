import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://qoa:supersecret@127.0.0.1:5432/qoa_local";

const queryClient = postgres(connectionString, {
  prepare: true,
  max: 5
});

export const db = drizzle(queryClient);

export type Database = typeof db;
