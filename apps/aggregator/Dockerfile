# syntax=docker/dockerfile:1.6
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY apps/aggregator/package.json apps/aggregator/
RUN pnpm install --frozen-lockfile --filter "@price-oracle/aggregator..."

FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable && apk add --no-cache wget
ENV NODE_ENV=production
COPY --from=deps /app /app
COPY apps/aggregator apps/aggregator
WORKDIR /app/apps/aggregator
EXPOSE 7402
CMD ["pnpm", "start"]
