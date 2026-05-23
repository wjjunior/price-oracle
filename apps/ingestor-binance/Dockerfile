# syntax=docker/dockerfile:1.6
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY apps/ingestor-binance/package.json apps/ingestor-binance/
RUN pnpm install --frozen-lockfile --filter "@price-oracle/ingestor-binance..."

FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY --from=deps /app /app
COPY apps/ingestor-binance apps/ingestor-binance
WORKDIR /app/apps/ingestor-binance
CMD ["pnpm", "start"]
