# syntax=docker/dockerfile:1.6
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY apps/ingestor-mock/package.json apps/ingestor-mock/
RUN pnpm install --frozen-lockfile --filter "@price-oracle/ingestor-mock..."

FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate && apk add --no-cache wget
ENV NODE_ENV=production
COPY --from=deps /app /app
COPY apps/ingestor-mock apps/ingestor-mock
WORKDIR /app/apps/ingestor-mock
EXPOSE 7401
CMD ["pnpm", "start"]
