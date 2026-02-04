# syntax=docker/dockerfile:1.5

FROM oven/bun:1-alpine AS deps
WORKDIR /app

# Install production dependencies first to leverage Docker layer caching
COPY src/package.json src/bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --production

FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY src/. .

EXPOSE 3000

CMD ["bun", "run", "start"]
