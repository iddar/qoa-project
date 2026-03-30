FROM oven/bun:1.3.8-alpine

WORKDIR /app

COPY package.json ./
COPY bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

RUN bun run db:migrate

EXPOSE 3000

CMD ["bun", "start"]
