---
title: Drizzle Kit Migration Flows
description: Summary of the six migration approaches supported by Drizzle Kit with when-to-use guidance.
---

# Drizzle Kit Migration Flows

Use this as a quick chooser when deciding how Codex should sync schema changes. Each option maps to actual CLI commands; prefer `bunx drizzle-kit <command>` (or `bun run <script>`) to stay Bun-first.

| Option | Source of truth | Typical workflow | Primary commands | When to choose |
| --- | --- | --- | --- | --- |
| 1. Pull only | Database schema | Pull DB schema into TS types, no migrations | `bunx drizzle-kit pull --out=./src/db/schema.ts` | Legacy DBs you query from Drizzle but migrate elsewhere. |
| 2. Push (no SQL files) | TypeScript schema | Push schema diffs straight to DB | `bunx drizzle-kit push` | Rapid prototyping or serverless databases when you just need schema applied. |
| 3. Pull + Generate | Database schema | Pull DB, generate TS schema, keep migrations external | `bunx drizzle-kit pull`, external tool | When DB-first teams want TS types mirrored in code. |
| 4. Generate + Runtime migrate | TypeScript schema | Generate SQL migrations, run at app startup | `bunx drizzle-kit generate`, then `bunx drizzle-kit migrate` inside app lifecycle | Monoliths/containers deploying zero-downtime migrations with rollback. |
| 5. Generate + CI migrate | TypeScript schema | Generate SQL migrations, run in CI/CD job | Same as option 4 but migrations executed from release pipeline | Teams with strict change controls; keep SQL artifacts in repo. |
| 6. Export SQL only | TypeScript schema | Export raw SQL to feed into Atlas/other tooling | `bunx drizzle-kit export` | When another tool (Atlas, Flyway) must remain the migration executor. |

## Tips

- Always commit both `drizzle/<timestamp>_migration.sql` and the sibling `snapshot.json` when using generate flows.
- The migrations table defaults to `__drizzle_migrations`; override via `migrations.table` + `schema` in config when needed (e.g., shared PostgreSQL schemas).
