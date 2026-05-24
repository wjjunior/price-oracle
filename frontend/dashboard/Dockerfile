# syntax=docker/dockerfile:1.6
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY frontend/dashboard frontend/dashboard
RUN pnpm install --frozen-lockfile --filter "@price-oracle/dashboard..."
RUN pnpm --filter @price-oracle/dashboard build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/frontend/dashboard/dist /usr/share/nginx/html
COPY frontend/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
