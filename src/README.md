# Qoa Core API

## Setup

```bash
bun install
```

## Run API

```bash
bun --env-file=.env.development run dev
```

## Migrations

```bash
bun run db:migrate
```

## Seed users for app testing

```bash
bun run db:seed:development
bun run db:seed:local
bun run db:seed:test
```

Default seed credentials use password `Password123!` and include:

- `qoa_admin`
- `qoa_support`
- `store_admin`
- `consumer`

Each environment uses isolated emails (`*.development@qoa.local`, `*.local@qoa.local`, `*.test@qoa.local`).
