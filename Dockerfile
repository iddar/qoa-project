# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.11-alpine AS deps
WORKDIR /repo

COPY package.json bun.lock tsconfig.base.json ./
COPY src/package.json src/package.json
COPY apps/backoffice/package.json apps/backoffice/package.json
COPY apps/cpg-portal/package.json apps/cpg-portal/package.json
COPY apps/store-dashboard/package.json apps/store-dashboard/package.json
COPY apps/digital-wallet/package.json apps/digital-wallet/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/auth-client/package.json packages/auth-client/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile

FROM oven/bun:1.3.11-alpine AS runner
WORKDIR /repo

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /repo/node_modules ./node_modules
COPY package.json bun.lock tsconfig.base.json ./
COPY src ./src
COPY packages ./packages

WORKDIR /repo/src

EXPOSE 3000

CMD ["bun", "run", "start"]
