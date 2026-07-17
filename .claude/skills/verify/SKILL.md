---
name: verify
description: Как собрать, запустить и руками проверить IT Audit Platform (монорепо pnpm, api NestJS + web Next.js). Использовать при verify любого изменения.
---

# Verify: IT Audit Platform

Поверхность продукта — HTTP: API на :3001, веб на :3000. Проверяем запуском собранных артефактов, не тестами.

## Сборка и запуск

**Одна команда (дев): `pnpm dev:up`** — инфраструктура (compose + ожидание healthy) → build → seed → оба dev-сервера (api :3001, web :3000).

По шагам / для проверки собранных артефактов:

```bash
pnpm infra:up         # docker compose up -d + scripts/wait-infra.mjs (не compose --wait: он спотыкается об one-shot minio-init)
                      # Postgres :5433, Redis :6380, MinIO :9000 (консоль :9001), Mailpit :1025 (UI :8025)
pnpm install          # если менялись зависимости
pnpm build            # shared → api (nest build) → web (next build); порядок топологический
pnpm seed             # идемпотентный (apps/api/src/seed.ts): гарантирует бакет audit-files, кладёт demo/welcome.txt;
                      # доменные сид-данные появятся вместе со схемой (T-010+)

# Продакшн-запуск собранных артефактов:
# API (из apps/api): node dist/main.js — порт из API_PORT, дефолт 3001
# Веб (из apps/web): npx next start — порт 3000; ждать "Ready in ..."
```

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

- Seed сработал? В MinIO-консоли (или через S3 API) в бакете `audit-files` лежит `demo/welcome.txt` со свежим timestamp.
- Фоновые задачи (T-040): `curl -X POST 'http://localhost:3001/jobs/demo?delayMs=2000'` → `{id}`; сразу `GET /jobs/demo/<id>` — `state:"delayed"`, через ~3с — `completed` с `returnValue`. `GET /jobs/heartbeat` — свежий `lastRunAt` (repeatable-джоба: первый прогон при старте api, дальше раз в минуту).

(Доменный seed пока пуст — расти будет вместе со схемой, дополнять этот файл начиная с T-010.)
