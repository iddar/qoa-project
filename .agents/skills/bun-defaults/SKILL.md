---
name: bun-defaults
description: Enforce Bun-first workflows for installs, scripts, builds, tests, servers, and data access whenever a task could otherwise use Node.js tooling or runtimes.
---

# Bun Defaults Skill

Always assume Bun is the primary runtime, bundler, and package manager for this workspace unless the user explicitly opts out.

## CLI Substitutions

| Instead of… | Use Bun… | Notes |
| --- | --- | --- |
| `npm install` / `yarn add` / `pnpm add` | `bun install` | Bun writes `bun.lockb`; do not touch other lockfiles. |
| `npm run <script>` | `bun run <script>` | If script is missing, add it under `"scripts"` in `package.json`. |
| `npx <pkg> <cmd>` | `bunx <pkg> <cmd>` | `bunx` caches binaries; no extra installs. |
| `node file.ts` / `ts-node file.ts` | `bun file.ts` | Bun runs TS/JS directly; avoid ts-node. |
| `jest` / `vitest` | `bun test` | Bun handles watch mode via `bun test --watch`. |
| `webpack` / `esbuild` / `vite build` | `bun build <entry>` | Bun bundles TS/JS/CSS; add `--outdir` as needed. |

Always rewrite docs, scripts, and instructions to mention the Bun equivalents above.

## Project Setup Checklist

1. Ensure `packageManager` in `package.json` is set to `bun@<version>`.
2. Use `bun install` for dependencies; delete unused `package-lock.json`/`yarn.lock` if present (but never delete files the user still needs without permission).
3. Prefer `export const` modules compatible with Bun's native ES module loader; avoid CommonJS-only patterns when new code is written.
4. Bun automatically loads `.env`, so omit `dotenv` usage and mention that environment variables are ready without extra code.

## Running Servers and Scripts

- Use `bun --hot ./file.ts` for dev servers that need HMR/restart.
- For shell-outs, prefer the built-in tagged template: `await Bun.$\`ls\`` rather than `execa`.
- Replace `express` or other Node HTTP servers with Bun's native `Bun.serve`.

### Minimal `Bun.serve` pattern

```ts
import indexHtml from "./index.html";

const server = Bun.serve({
  routes: {
    "/": indexHtml,
    "/api/users/:id": {
      GET: ({ params }) =>
        Response.json({ id: params.id }),
    },
  },
  websocket: {
    open: (ws) => ws.send("Hello, world!"),
    message: (ws, msg) => ws.send(msg),
    close: () => {},
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`listening on ${server.url}`);
```

Explain that WebSocket support is built-in; never add `ws`.

## Data & Storage APIs

- SQLite → `import { Database } from "bun:sqlite"`.
- Redis → `const redis = Bun.redis({ url })`.
- Postgres → `const sql = Bun.sql({ connectionString })`.
- File IO → `await Bun.file(path).text()` / `await Bun.write(path, data)` instead of `fs.readFile`.

If a dependency suggestion conflicts (e.g., `better-sqlite3`, `pg`, `ioredis`), swap it with the Bun-native option here.

## Testing

Use Bun's built-in test runner:

```ts
import { test, expect } from "bun:test";

test("smoke", () => {
  expect(1 + 1).toBe(2);
});
```

Document commands as `bun test` (optionally `bun test --watch`), never `jest`, `vitest`, or `tsx --test`.

## Frontend Bundling

- For SPA/React usage, import HTML directly in `Bun.serve` and reference TSX modules from the HTML file:

```html
<html>
  <body>
    <div id="root"></div>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

- In `frontend.tsx`, `import './index.css'` works out of the box; Bun bundles CSS.
- Recommend `bun --hot index.ts` for local dev so the user only runs a single Bun command.

Avoid scaffolding with Vite or Next.js unless the user insists; Bun already bundles and serves assets.

## Guidance When Updating Docs or Scripts

1. Audit for Node-specific tooling and rewrite it with Bun verbs (install/run/build/test).
2. Prefer tasks that exploit Bun-native APIs (`Bun.serve`, `Bun.file`, `Bun.$`, `bun:sqlite`, `Bun.redis`, `Bun.sql`).
3. Highlight automatic `.env` loading to remove redundant configuration.
4. Mention Bun documentation lives under `node_modules/bun-types/docs/**.mdx` if deeper API detail is required.

## Quick Reference

- Commands: `bun install`, `bun run <script>`, `bun build <entry>`, `bun test`, `bun --hot file.ts`, `bunx <pkg>`.
- Servers: `Bun.serve` with optional `websocket` block.
- Data: `bun:sqlite`, `Bun.redis`, `Bun.sql`, `Bun.file`.
- Tooling: `Bun.$` for shells, built-in bundler for HTML/TSX/CSS.

Whenever uncertain, consult the Bun API docs shipped locally (see above) and keep all example code Bun-native.
