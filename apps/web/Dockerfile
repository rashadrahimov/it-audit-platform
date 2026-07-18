# syntax=docker/dockerfile:1
# Прод-образ web (T-I02, EP-ONPREM «single artifact»): Next.js build + next start.
# Контекст сборки — корень репозитория:  docker build -f apps/web/Dockerfile -t it-audit-web .

# --- builder: install (web+shared) + build shared+web ---
FROM node:24-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @it-audit/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @it-audit/shared build && pnpm --filter @it-audit/web build

# --- runtime: .next + node_modules, next start ---
FROM node:24-bookworm-slim AS runtime
WORKDIR /app/apps/web
ENV NODE_ENV=production
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared /app/packages/shared
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/node_modules ./node_modules
COPY --from=builder /app/apps/web/package.json ./package.json
COPY --from=builder /app/apps/web/next.config.ts ./next.config.ts
COPY --from=builder /app/apps/web/src/messages ./src/messages
EXPOSE 3000
USER node
# API_URL — базовый адрес API (дефолт http://localhost:3001)
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
