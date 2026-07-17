# IT Audit Platform

Multi-tenant платформа IT-аудита для групп компаний (класс audit-management: engagements, findings, working papers, risk-based planning). Соло-разработка, TypeScript.

## Структура (ADR-0018)

| Путь              | Что это                                                  |
| ----------------- | -------------------------------------------------------- |
| `apps/api`        | NestJS — REST API + OpenAPI (Swagger на `/docs`)         |
| `apps/web`        | Next.js App Router — UI                                  |
| `packages/shared` | Zod-схемы и типы, общие для api/web                      |
| `docs/`           | **Источник правды**: backlog, ADR, модель данных, ресёрч |

Начинать чтение с [docs/backlog.md](docs/backlog.md) (блок «СЕЙЧАС») и [docs/adr/](docs/adr/).

## Команды

```bash
pnpm install
pnpm build            # собрать всё (shared → api, web)
pnpm lint             # ESLint по всему монорепо
pnpm typecheck        # tsc по всем пакетам
pnpm test             # Vitest по всем пакетам
pnpm format           # Prettier

pnpm --filter @it-audit/api dev    # API на :3001 (Swagger: /docs)
pnpm --filter @it-audit/web dev    # Web на :3000
```

Требования: Node ≥ 24, pnpm 11 (`corepack enable`). Переменные окружения — см. [.env.example](.env.example).

## CI

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)): install → build → lint → typecheck → format check → test на каждый push/PR в `main`.
