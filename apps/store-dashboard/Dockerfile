# --- Stage 1: Install dependencies ---
FROM oven/bun:1.3.8-debian AS deps

WORKDIR /app

# Copy workspace root + all package.json files
COPY package.json bun.lock ./
COPY src/package.json ./src/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/auth-client/package.json ./packages/auth-client/
COPY packages/ui/package.json ./packages/ui/
COPY apps/backoffice/package.json ./apps/backoffice/
COPY apps/cpg-portal/package.json ./apps/cpg-portal/
COPY apps/store-dashboard/package.json ./apps/store-dashboard/
COPY apps/digital-wallet/package.json ./apps/digital-wallet/

RUN bun install --frozen-lockfile

# --- Stage 2: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/node_modules ./src/node_modules
COPY --from=deps /app/packages/api-client/node_modules ./packages/api-client/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY --from=deps /app/apps/store-dashboard/node_modules ./apps/store-dashboard/node_modules

# Copy source code
COPY package.json tsconfig.base.json ./
COPY src/ ./src/
COPY packages/ ./packages/
COPY apps/store-dashboard/ ./apps/store-dashboard/

WORKDIR /app/apps/store-dashboard
RUN npm run build

# --- Stage 3: Production ---
FROM oven/bun:1.3.8-debian AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/store-dashboard/.next/standalone ./
COPY --from=builder /app/apps/store-dashboard/.next/static ./apps/store-dashboard/.next/static
COPY --from=builder /app/apps/store-dashboard/public ./apps/store-dashboard/public

EXPOSE 3003

CMD ["bun", "apps/store-dashboard/server.js"]
