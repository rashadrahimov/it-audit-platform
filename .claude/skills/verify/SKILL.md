---
name: verify
description: Как собрать, запустить и руками проверить IT Audit Platform (монорепо pnpm, api NestJS + web Next.js). Использовать при verify любого изменения.
---

# Verify: IT Audit Platform

Поверхность продукта — HTTP: API на :3001, веб на :3000. Проверяем запуском собранных артефактов, не тестами.

## Сборка и запуск

```bash
docker compose up -d  # инфраструктура: Postgres :5433, Redis :6380, MinIO :9000 (консоль :9001), Mailpit :1025 (UI :8025)
                      # one-shot minio-init сам создаёт бакет audit-files; ждать healthy: docker compose ps
pnpm install          # если менялись зависимости
pnpm build            # shared → api (nest build) → web (next build); порядок топологический

# API (из apps/api): собранный артефакт
node dist/main.js     # порт из API_PORT, дефолт 3001; лог старта Nest в stdout
# Веб (из apps/web): продакшн-сервер поверх .next
npx next start        # порт 3000; ждать "Ready in ..."
```

Для дева: `pnpm --filter @it-audit/api dev` и `pnpm --filter @it-audit/web dev`.

## Что дёргать

- `curl http://localhost:3001/health` — JSON `{status:"ok",service:"api",...}` по схеме из `packages/shared`.
- `curl http://localhost:3001/health/infra` — все четыре сервиса `ok:true`; если что-то лежит — HTTP 503, `status:"degraded"` и `error` у виновника. Письма смотреть в Mailpit UI `http://localhost:8025`, файлы — в MinIO-консоли `http://localhost:9001` (minioadmin/minioadmin).
- `http://localhost:3001/docs` — Swagger UI; `/docs-json` — OpenAPI-спека (должна содержать новые маршруты).
- `curl http://localhost:3000/` — главная; в HTML есть `data-testid="api-status"`: зелёный «api v0.0.1 — ok» при живом API, красный «API недоступен» при погашенном (страница не 500-ит).

## Гочи

- Веб фетчит API **server-side** (адрес из `API_URL`), CORS не нужен; проверять именно HTML веба, а не только API.
- После правок кода перед `next start` / `node dist/main.js` нужен свежий `pnpm build` — серверы отдают собранное.
- `.env` не требуется: дефолты (3001, `http://localhost:3001`, `postgres://…:5433`, `redis://…:6380`, MinIO/SMTP) зашиты в код и совпадают с docker-compose.
- Postgres/Redis на **нестандартных хост-портах 5433/6380** — 5432/6379 заняты соседним проектом (leaddrive-uxtest). Внутри контейнеров порты стандартные.
- Порты 3000/3001 заняты? Тестовые процессы прошлого прогона: `ss -tlnp | grep ':300'` и убить.

(T-007 добавит seed демо-данных — дополнить этот файл после него.)
