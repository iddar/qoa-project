---
name: drizzle-orm
description: Design, migrate, and query SQL databases with Drizzle ORM + Drizzle Kit (Bun-first). Use when Codex must define schemas, run migrations, or write queries for PostgreSQL, MySQL, SQLite, or Drizzle Gel using Drizzle.
---

# Drizzle ORM Skill

Use this skill whenever a task touches Drizzle ORM, Drizzle Kit, or Drizzle Studio—schema modeling, migrations, Drizzle Gel edge DB, or writing SQL-safe queries from Bun services.

## Quick Start

1. **Install tooling (Bun):**
   ```sh
   bun add drizzle-orm drizzle-kit
   bun add -D drizzle-kit
   # plus driver: pg | @neondatabase/serverless | postgres | better-sqlite3 | mysql2 | @libsql/client
   ```
2. **Init config:** `bunx drizzle-kit init` creates `drizzle.config.ts`. Keep paths relative to repo root.
3. **Author schema:** create `src/db/schema/*.ts` exporting tables via `pgTable`, `mysqlTable`, `sqliteTable`, or `gelTable`.
4. **Pick a migration flow:** use the chooser in `references/migration-flows.md`.
5. **Run queries:** instantiate the right driver (`drizzle(client)`) and write strongly typed queries with chains like `.select().where(eq(users.id, userId))`.

Consult `references/drizzle-kit-cli.md` for CLI invocations and `references/migration-flows.md` for flow-by-flow detail.

## Project Setup & Config

- Always set `"packageManager": "bun@<version>"` and expose scripts such as:
  ```jsonc
  {
    "scripts": {
      "drizzle:generate": "bunx drizzle-kit generate",
      "drizzle:push": "bunx drizzle-kit push",
      "drizzle:studio": "bunx drizzle-kit studio"
    }
  }
  ```
- Example `drizzle.config.ts`:
  ```ts
  import { defineConfig } from "drizzle-kit";

  export default defineConfig({
    dialect: "postgresql", // postgresql | mysql | sqlite | op-sqlite | gel
    schema: "./src/db/schema/index.ts",
    out: "./drizzle",
    strict: true,
    migrations: {
      schema: "public",
      table: "__drizzle_migrations",
    },
  });
  ```
- Keep schema export(s) centralized (e.g., `src/db/schema/index.ts` re-exporting table objects). When working in monorepos, reference the compiled path used by each package.

## Schema Design Patterns

- Favor table-per-file modules with `export const users = pgTable("users", { ... })` plus indexes (`index`, `uniqueIndex`) and relations via `relations(users, ({ many }) => ({ posts: many(posts) }))`.
- Derive types:
  ```ts
  export type User = typeof users.$inferSelect;
  export type NewUser = typeof users.$inferInsert;
  ```
- Use helpers such as `varchar`, `timestamp`, `boolean`, and `jsonb` (Postgres) or `text`, `integer`, `blob` (SQLite). Drizzle enforces column constraints at type level; lean on `.defaultNow()`, `.references(() => other.id, { onDelete: "cascade" })`, etc.
- For enums, prefer `pgEnum("role", ["admin", "member"])` or `mysqlEnum`.

## Dialects & Connections

| Target | Driver snippet |
| --- | --- |
| **PostgreSQL (server)** | `import { drizzle } from "drizzle-orm/node-postgres"; const client = new Client({ connectionString }); await client.connect(); export const db = drizzle(client);` |
| **Bun SQL (Postgres via Bun.sql)** | `import { drizzle } from "drizzle-orm/bun-sql"; import { SQL } from "bun"; const sql = new SQL(process.env.DATABASE_URL!); export const db = drizzle({ client: sql });` |
| **Postgres serverless/HTTP** | `import { drizzle } from "drizzle-orm/neon-http"; import { neon } from "@neondatabase/serverless"; const sql = neon(process.env.DATABASE_URL!); export const db = drizzle(sql);` |
| **MySQL** | `import { drizzle } from "drizzle-orm/mysql2"; const pool = mysql.createPool(process.env.DATABASE_URL!); export const db = drizzle(pool);` |
| **SQLite (file)** | `import { Database } from "bun:sqlite"; import { drizzle } from "drizzle-orm/bun-sqlite"; export const db = drizzle(new Database("app.db"));` |
| **Turso/libSQL** | `import { createClient } from "@libsql/client"; import { drizzle } from "drizzle-orm/libsql";` |
| **Drizzle Gel (edge)** | `import { drizzle } from "drizzle-orm/gel"; import { connect } from "@drizzle-team/gel";` |

Tips:
- Always close pools on process exit to avoid hanging tests.
- When mixing HTTP handlers, instantiate the client once per process (Bun global) to reuse connections.
- Use `drizzle-orm/bun-sql` whenever you rely on Bun's native `SQL` driver; import the adapter and either pass a `DATABASE_URL` string or supply an explicit `SQL` client when you need manual control. citeturn0search2
- For Bun SQL, you can skip the explicit `SQL` client and call `drizzle(process.env.DATABASE_URL!)` directly when `DATABASE_URL` uses a supported Postgres/MySQL/SQLite URI; fall back to `new SQL()` when you need manual adapter selection. citeturn0search2
- Bun 1.2.0 has a known issue with concurrent SQL statements; keep multi-query workloads sequential or follow the upstream GitHub issue before turning on parallel query execution. citeturn0search9

## Migrations & Change Management

1. Choose a flow (options 1‑6) via `references/migration-flows.md`.
2. Run CLI using Bun (e.g., `bun run drizzle:generate`, `bunx drizzle-kit push`).
3. Commit generated SQL plus `drizzle/meta` snapshots so diffs remain deterministic.
4. For CI migrations, add a job step:
   ```sh
   bun install
   bun run drizzle:generate # optional
   bun run drizzle:migrate  # custom script running node script or `bunx drizzle-kit migrate`
   ```
5. The migrations table defaults to `__drizzle_migrations`; override in `drizzle.config.ts` when schemas differ per environment.

## Query & Builder Patterns

- Basic select:
  ```ts
  const result = await db.select().from(users).where(eq(users.id, userId));
  ```
- Joins:
  ```ts
  const rows = await db
    .select({ userId: users.id, note: notes.body })
    .from(users)
    .leftJoin(notes, eq(notes.userId, users.id))
    .where(and(eq(users.status, "active"), gt(notes.createdAt, cutoff)));
  ```
- Inserts/updates:
  ```ts
  await db.insert(users).values(newUser).returning({ id: users.id });
  await db.update(users).set({ status: "archived" }).where(eq(users.id, userId));
  ```
- Raw SQL fallback: `await db.execute(sql\`select now()\`);` when features lag behind builder support.

## Tooling & Observability

- **Drizzle Studio:** `bun run drizzle:studio` launches a local viewer with schema browsing, filtering, and editing. Keep it dev-only.
- **Introspection:** `bunx drizzle-kit introspect --log` prints database metadata before generating schema files.
- **Snapshots:** snapshot JSON files under `drizzle/meta` record table definitions; never hand-edit them.
- **Logging:** wrap driver clients with instrumentation (e.g., `neon` provides `neonConfig.fetchEndpoint`) or use `logger: true` in Drizzle connections when debugging SQL.

## Testing & Verification

- For unit tests, point SQLite/Bun projects to an in-memory DB: `new Database(":memory:")`.
- Use transaction wrappers (`db.transaction(async (tx) => { ... })`) around multi-step mutations to ensure atomicity.
- Pair schema tests with `bun test` to verify relations/resolvers compile (e.g., import schema inside tests to catch type regressions).

## References

- [Drizzle Kit CLI cheatsheet](references/drizzle-kit-cli.md)
- [Migration flow chooser](references/migration-flows.md)

Load these reference files when you need detailed command syntax or when selecting a migration strategy.
