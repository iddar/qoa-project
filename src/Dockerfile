FROM node:20-alpine

WORKDIR /app

RUN npm install -g bun

COPY package.json ./
COPY package-lock.json ./
COPY bun.lock ./

RUN npm ci

COPY . .

RUN bun run db:migrate

EXPOSE 3000

CMD ["bun", "start"]
