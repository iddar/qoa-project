---
title: Drizzle Kit CLI Cheatsheet
description: Frequently used Drizzle Kit commands with Bun-friendly invocations.
---

# Drizzle Kit CLI Cheatsheet

Run commands with `bunx drizzle-kit …` unless a package script wraps them.

## Project Bootstrap

- `bun add drizzle-orm drizzle-kit` (plus driver, e.g., `pg`, `better-sqlite3`, or `postgres`) — install runtime + CLI.
- `bunx drizzle-kit init` — scaffold `drizzle.config.ts` with placeholders for driver, schema path, and out folder.

## Schema Sync

- `bunx drizzle-kit generate` — diff TS schema against snapshot and emit SQL under `drizzle/`. Pair with option 4/5 in the migration flows reference.
- `bunx drizzle-kit push` — push schema changes directly to the DB without emitting SQL files (option 2).
- `bunx drizzle-kit pull` — reverse engineer the live DB into TS schema definitions (options 1 & 3).
- `bunx drizzle-kit up|down` — apply/revert generated migrations manually; typically used in CI or local testing.

## Tooling

- `bunx drizzle-kit studio` — launch Drizzle Studio (web UI) for browsing schema/data with watch reloads.
- `bunx drizzle-kit introspect --log` — inspect DB metadata and print SQL; helpful before `pull`.
- `bunx drizzle-kit drop` — drop all tables that belong to the current schema; guard behind confirmations.

## Configuration Notes

- `drizzle.config.ts` exports `defineConfig({ schema: "./src/db/schema.ts", out: "./drizzle", dialect: "postgresql" })`. Set `dialect` to `postgresql`, `mysql`, `sqlite`, or `op-sqlite`. `strict: true` enforces explicit default values.
- For Bun projects, import `defineConfig` from `"drizzle-kit"` and keep all paths relative to the repo root so `bun run drizzle:generate` works from CI.
