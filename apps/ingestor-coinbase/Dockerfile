# syntax=docker/dockerfile:1.6
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY apps/ingestor-coinbase/package.json apps/ingestor-coinbase/
RUN pnpm install --frozen-lockfile --filter "@price-oracle/ingestor-coinbase..."

FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
ENV NODE_ENV=production
COPY --from=deps /app /app
COPY apps/ingestor-coinbase apps/ingestor-coinbase
WORKDIR /app/apps/ingestor-coinbase
CMD ["pnpm", "start"]
