---
name: oxc-lint-format
description: Run and adjust Oxlint/Oxfmt for this repository. Use when asked to lint or format JavaScript/TypeScript code, fix lint issues, check formatting in CI, or tweak Oxlint/Oxfmt CLI options or related config files in this repo.
---

# Oxc Lint Format

## Overview

Use the existing Bun scripts in `src/package.json` to run Oxlint and Oxfmt. Prefer script-based commands over ad-hoc CLI so behavior stays consistent with CI.

## Quick Start (from repo root)

1. `cd src`
2. Lint: `bun run lint`
3. Lint + fix: `bun run lint:fix`
4. Format: `bun run fmt`
5. Format check (CI-style): `bun run fmt:check`

## Common Tasks

### Fix Lint Errors

Run `bun run lint:fix`. If errors remain, fix them manually, then re-run `bun run lint`.

### Adjust Lint Rules Or Options

Edit the script flags in `src/package.json` (current flags: `--type-aware -A all -D typescript/no-floating-promises`). If you add a config file later (for example `.oxlintrc.json`), keep the script flags minimal and document the config. Run `bun run lint` after changes to confirm.

### Troubleshoot Type-Aware Linting

`--type-aware` relies on `src/tsconfig.json`. Run lint from `src/` so Oxlint resolves the TypeScript config. If type-aware linting fails due to tsconfig discovery, pass an explicit `--tsconfig ./tsconfig.json` in the script.

## Notes

Scripts live in `src/package.json`; dependencies are in `src/devDependencies`. Avoid `npm`/`pnpm` here; use `bun`/`bunx`.
