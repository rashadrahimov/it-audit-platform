# syntax=docker/dockerfile:1
# Прод-образ API (T-I01, EP-ONPREM «single artifact»): multi-stage сборка pnpm-монорепо.
# Контекст сборки — корень репозитория:  docker build -f apps/api/Dockerfile -t it-audit-api .

# --- builder: install (только api+shared) + build shared+api ---
FROM node:24-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
# манифесты сначала — слой install кэшируется, пока не менялись зависимости
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @it-audit/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @it-audit/shared build && pnpm --filter @it-audit/api build

# --- runtime: только собранные артефакты + prod-node_modules ---
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
EXPOSE 3001
USER node
# порт из API_PORT (дефолт 3001); DATABASE_URL и прочее — из окружения (см. .env.example)
CMD ["node", "apps/api/dist/main.js"]
