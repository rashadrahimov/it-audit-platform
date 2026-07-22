# V1 release docs pack

Статус: T-H139, buildable-документация для релизной готовности. Документ закрывает базовый набор DOC-01..07: администрирование, пользовательские сценарии, API, runbook, DR/backup-restore, эксплуатационные проверки и known blockers.

## 1. Быстрый старт администратора

1. Поднять инфраструктуру и приложение локально:
   - `pnpm infra:up`
   - `pnpm build`
   - `pnpm db:migrate`
   - `pnpm seed`
   - `pnpm dev`
2. Открыть web на `http://localhost:3000`, API health на `http://localhost:3001/health`, Swagger/OpenAPI на `http://localhost:3001/docs`.
3. Проверить tenant context: все web-запросы идут через session cookie; public REST API v1 использует `X-Api-Key`.
4. Для production использовать `docker-compose.prod.yml` и `.env.prod`; секреты не коммитятся.

Базовые зоны администратора в UI:

- `/config`: audit types, custom fields, tags, glossary, SLA, business profile.
- `/roles`, `/members`, `/field-permissions`: RBAC, пользователи, field-level права.
- `/api-keys`: выдача и отзыв public REST API keys.
- `/connectors`: manual/LDAP/HTTP JSON connectors, test connection, sync.
- `/notifications`, `/ai-settings`, `/sso-settings`: delivery, AI provider, SSO.

## 2. Пользовательские сценарии

Основной рабочий путь аудитора:

1. Создать или открыть engagement в `/engagements`.
2. Проверить checklist, добавить ответы и evidence requests.
3. Зафиксировать findings, назначить owner, remediation tasks и follow-up plan.
4. Пройти workflow engagement до review/sign-off/report.
5. Выпустить report package или exports из карточки engagement и `/reports`.

Сценарии GRC/комплаенса:

- Frameworks and controls: `/frameworks`, `/controls`, `/tests`.
- Risk management: `/risks`, `/risk-heatmap`, `/trends`.
- Evidence and documents: `/documents`, evidence tracker in engagement detail.
- Access and IAM: `/iam`, `/access-reviews`, `/devices`.
- Privacy: `/privacy` for ROPA and DPIA workflow.
- Third-party: `/vendors`, `/trust-center`, `/questionnaires`, `/knowledge-base`.

Навигационный smoke всех 44 разделов покрыт `apps/web/e2e/audit.spec.ts`; это главный регресс на доступность экранов, сессию, 5xx, console errors и horizontal scroll.

## 3. API guide

Swagger/OpenAPI доступен на `/docs` в API runtime. Для внутренних API требуется JWT/session context и tenant slug; для публичного REST API v1:

- создать ключ на `/api-keys`;
- передавать `X-Api-Key: <key>`;
- читать индекс `GET /api/v1`;
- ресурсы v1 read-only: controls, findings, risks, vendors, policies, engagements, assets, tests, vulnerabilities, security-alerts, documents.

Интеграционные контракты:

- все tenant-scoped доменные таблицы защищены RLS;
- API keys хранятся только hash-вариантом, plaintext показывается один раз;
- audit log hash-chain проверяется через audit verify-chain;
- public v1 намеренно read-only, мутации остаются под JWT/RBAC.

## 4. Runbook

Проверки перед merge/deploy:

1. `pnpm build`
2. `pnpm db:migrate`
3. `pnpm seed`
4. `pnpm lint`
5. `pnpm typecheck`
6. `pnpm format:check`
7. `pnpm test`
8. `pnpm --filter @it-audit/web test:e2e` при поднятых API/web/infra.

Production deploy workflow: `.github/workflows/deploy.yml`.

Необходимые GitHub Actions secrets:

- `DEPLOY_SSH_KEY`
- `DEPLOY_HOST`
- `DEPLOY_PATH`
- optional `DEPLOY_USER`

Текущий блокер production deploy: secrets выше отсутствуют, поэтому workflow падает до SSH. После добавления секретов workflow выполняет `git pull --ff-only` на сервере и `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`.

## 5. DR plan and backup/restore

Уровни восстановления, которые уже есть в продукте:

- engagement export JSON: `GET /engagements/:id/export`;
- engagement duplicate/restore внутри приложения: `POST /engagements/:id/duplicate`;
- config transfer для audit types, config lists, custom fields, glossary;
- document storage через S3-compatible backend;
- audit log verify-chain для обнаружения tampering.

Операционная процедура backup для self-hosted инсталляции:

1. Снять PostgreSQL backup на уровне инстанса до deploy и перед миграциями.
2. Снять backup object storage bucket, где лежат документы/evidence.
3. Сохранить `.env.prod` и внешние secrets в secret manager клиента, не в git.
4. Проверить restore на staging: БД -> object storage -> `pnpm db:migrate` -> health -> smoke login -> report/export.

Ограничения до infra-решения клиента:

- pgBackRest/WAL-PITR, WORM/S3 Object Lock, syslog retention и HA не включены в репо как готовая клиентская инфраструктура.
- Granular restore одного engagement на уровне приложения закрыт export+duplicate; полная BCK-политика клиента требует выбранного backup provider, retention windows и restore RTO/RPO.

## 6. Release gates

Перед v1 к продажам остаются отдельные gates:

- production deploy secrets и smoke на реальном prod;
- нагрузочное тестирование на целевом масштабе данных;
- независимый security/pentest pass;
- WCAG AA/a11y audit на полном UI;
- UAT с клиентом на реальных данных;
- утверждённая клиентом backup/restore policy.

