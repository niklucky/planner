FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Fetch dependencies using only the lockfile so this layer is cached
COPY pnpm-lock.yaml ./
RUN pnpm fetch

COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @planner/app build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
