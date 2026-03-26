# Qoa Core API

## Setup

```bash
bun install
```

## Run API

```bash
bun --env-file=.env.development run dev
```

- `development`: corre Bun en tu host y usa solo Postgres/Redis de Docker.
- `local`: corre la app dentro de Docker para aproximar el entorno Linux externo.
- `test`: usa una base independiente y se reconstruye en cada corrida.

## Migrations

```bash
bun run db:migrate
```

## Rebuild per environment

```bash
bun run db:rebuild:development
bun run db:rebuild:local
bun run db:rebuild:staging
bun run db:rebuild:test
```

## Seed users for app testing

```bash
bun run db:seed:development
bun run db:seed:local
bun run db:seed:staging
bun run db:seed:test
```

Default seed credentials use password `Password123!` and include:

- `qoa_admin`
- `qoa_support`
- `store_admin`
- `consumer`

Each environment uses isolated emails (`*.development@qoa.local`, `*.local@qoa.local`, `*.test@qoa.local`).

For `development` and `local`, the seed also creates demo activity for UX validation:

- 30-day purchase history
- campaign subscriptions and multi-campaign accumulation
- active policy fixtures per campaign (min amount, min quantity, max accumulations, cooldown)
- active rewards and completed redemptions for KPI/report widgets

`test` keeps a minimal dataset for faster automated runs.
