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
COPY --from=deps /app/apps/cpg-portal/node_modules ./apps/cpg-portal/node_modules

# Copy source code
COPY package.json tsconfig.base.json ./
COPY src/ ./src/
COPY packages/ ./packages/
COPY apps/cpg-portal/ ./apps/cpg-portal/

WORKDIR /app/apps/cpg-portal
RUN npm run build

# --- Stage 3: Production ---
FROM oven/bun:1.3.8-debian AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/cpg-portal/.next/standalone ./
COPY --from=builder /app/apps/cpg-portal/.next/static ./apps/cpg-portal/.next/static
RUN test -d /app/apps/cpg-portal/public && cp -r /app/apps/cpg-portal/public ./apps/cpg-portal/public || true

RUN find . -name "package.json" -delete 2>/dev/null || true

EXPOSE 3002

CMD ["bun", "apps/cpg-portal/server.js"]
