# syntax=docker/dockerfile:1.5

FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies first to leverage Docker layer caching
COPY src/package.json src/bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY src/. .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "run", "start"]
