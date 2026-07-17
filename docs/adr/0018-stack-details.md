# Детали стека поверх ADR-0008 (T-004)

Монорепозиторий (pnpm workspaces): `apps/api` — **NestJS** (REST + автогенерация OpenAPI/Swagger — прямой ответ на INT-01/EP-API «API-first»; DI, guards под RBAC-матрицу ADR-0013, модульность под рост до RFP-модулей), `apps/web` — **Next.js App Router** (UI, ест собственный публичный API), `packages/shared` — zod-схемы и типы, общие для обеих сторон.

Выбор в парах:
- **ORM: Drizzle** (не Prisma) — SQL-first, прозрачная работа с Postgres RLS (set_config в транзакции на каждый запрос — критично для ADR-0003), лёгкие миграции drizzle-kit.
- **UI: Tailwind + shadcn/ui** (+ TanStack Table для гридов engagement'а, Recharts для дашбордов) — стек поддержан скиллом ui-ux-pro-max.
- **Валидация: Zod** сквозная (API DTO ↔ формы), OpenAPI из тех же схем.
- **Тесты: Vitest** (unit/integration) + **Playwright** (e2e ключевых флоу).
- **Rich-text (working papers): Tiptap** (ProseMirror), контент в jsonb.
- **i18n: next-intl** (EN/AZ/RU, ADR-0009) + terminology_override поверх.
- Зафиксировано ранее: BullMQ+Redis (фон), S3-совместимое хранилище, SMTP (ADR-0002/0008).

Альтернатива «чистый Next.js fullstack без NestJS» отвергнута: публичный документированный REST API — Mandatory требование RFP (INT-01), а OpenAPI-тулинг Route Handlers заметно слабее NestJS/Swagger.
