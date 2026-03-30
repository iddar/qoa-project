FROM node:20-alpine

RUN apk add --no-cache bun

WORKDIR /app

COPY package.json ./
COPY bun.lock ./

RUN npm install --frozen-lockfile

COPY . .

RUN bun run db:migrate

EXPOSE 3000

CMD ["bun", "start"]
