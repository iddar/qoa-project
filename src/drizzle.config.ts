import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  strict: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://qoa:supersecret@127.0.0.1:5432/qoa_local',
  },
  migrations: {
    schema: 'public',
    table: '__drizzle_migrations',
  },
});
