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
                      # Postgres :5433, Redis :6380, MinIO :9000 (консоль :9001), Mailpit :1025 (UI :8025),
                      # Keycloak :8081 (админка admin/admin; realm it-audit автоимпортируется, стартует ~30с),
                      # LDAP :1389 (osixia/openldap; base dc=demo,dc=io, админ cn=admin,dc=demo,dc=io/admin)
pnpm install          # если менялись зависимости
pnpm build            # shared → api (nest build) → web (next build); порядок топологический
pnpm db:migrate       # drizzle-kit: применяет миграции из apps/api/drizzle (схема — src/db/schema.ts)
pnpm db:migrate:down  # откат последней миграции (парные drizzle/down/<tag>.down.sql + раннер dist/db/migrate-down.js)
pnpm seed             # идемпотентный (apps/api/src/seed.ts): бакет audit-files + demo/welcome.txt;
                      # доменные данные: tenant «demo» (Demo Group) с дочкой demo-bank

# Продакшн-запуск собранных артефактов:
# API (из apps/api): node dist/main.js — порт из API_PORT, дефолт 3001
# Веб (из apps/web): npx next start — порт 3000; ждать "Ready in ..."
```

## Что дёргать

- `curl http://localhost:3001/health` — JSON `{status:"ok",service:"api",...}` по схеме из `packages/shared`.
- `curl http://localhost:3001/health/infra` — все четыре сервиса `ok:true`; если что-то лежит — HTTP 503, `status:"degraded"` и `error` у виновника. Письма смотреть в Mailpit UI `http://localhost:8025`, файлы — в MinIO-консоли `http://localhost:9001` (minioadmin/minioadmin).
- `http://localhost:3001/docs` — Swagger UI; `/docs-json` — OpenAPI-спека (должна содержать новые маршруты).
- `curl http://localhost:3000/` — главная; в HTML есть `data-testid="api-status"`: зелёный «api v0.0.1 — ok» при живом API, красный «API unavailable» (en) при погашенном (страница не 500-ит). Локаль — cookie: `curl -H 'Cookie: locale=ru'` → `<html lang="ru">` и русские строки (аналогично az); без/с мусорной cookie — en.

## Гочи

- Веб фетчит API **server-side** (адрес из `API_URL`), CORS не нужен; проверять именно HTML веба, а не только API.
- После правок кода перед `next start` / `node dist/main.js` нужен свежий `pnpm build` — серверы отдают собранное.
- `.env` не требуется: дефолты (3001, `http://localhost:3001`, `postgres://…:5433`, `redis://…:6380`, MinIO/SMTP) зашиты в код и совпадают с docker-compose.
- Postgres/Redis на **нестандартных хост-портах 5433/6380** — 5432/6379 заняты соседним проектом (leaddrive-uxtest). Внутри контейнеров порты стандартные.
- Порты 3000/3001 заняты? Тестовые процессы прошлого прогона: `ss -tlnp | grep ':300'` и убить.

- Seed сработал? В MinIO-консоли (или через S3 API) в бакете `audit-files` лежит `demo/welcome.txt` со свежим timestamp.
- БД (T-010): `docker exec it-audit-platform-postgres-1 psql -U audit -d audit -c '\dt public.*'` — таблицы `tenant`, `subsidiary`; после seed в них demo-строки. Откат: `pnpm db:migrate:down` убирает таблицы и запись журнала; `pnpm db:migrate` возвращает. Новая миграция = `pnpm db:generate` + обязательный парный `apps/api/drizzle/down/<tag>.down.sql`.
- RLS (T-011): `cd apps/api && npx vitest run test/rls.spec.ts` — 4 теста изоляции (нужны инфраструктура + миграции). Рантайм ходит под ролью `app` (не суперюзер!): доступ к доменным таблицам — только через `DbService.withTenant()`; без контекста — 0 строк. Новые доменные таблицы обязаны получать RLS-политику в той же миграции.
- Auth (T-013): `POST /auth/register` (слабый пароль → 400 со списком нарушений; `tenantSlug` применяет политику из `tenant.settings.passwordPolicy`), `POST /auth/login` → `{accessToken}`, `GET /auth/me` c Bearer (без — 401), `POST /auth/change-password` (204; старый пароль перестаёт работать). 5 неверных паролей подряд → lockout на 15 мин даже для верного. Хеш в БД начинается с `scrypt:`.
- RBAC (T-018/T-019): под Bearer — `GET /rbac/permissions` (30 шт. из seed), `GET /rbac/roles` — 7 системных пресетов (Admin…Approver; Approver: approve=edit, остальное view), `?tenantSlug=demo` добавляет роль «Демо-аудиторы» (итого 8); без `tenantSlug` тенантские роли не видны (RLS).
- Enforcement (T-020): демо-логины `admin@demo.io`/`Demo-Admin-2026` и `collaborator@demo.io`/`Demo-Collab-2026`. `POST /rbac/demo-edit` (+`X-Tenant-Slug: demo`): Collaborator → 403, Admin → 201, без заголовка → 400. `GET /rbac/check?resource=&action=` → `{level, canView, canEdit}` — этим UI прячет недоступное. Тест: `npx vitest run test/rbac-enforcement.spec.ts` (нужен прогнанный seed).
- Деактивация (T-017): `POST /users/:id/deactivate` (Admin, 204) → логин юзера 401; `.../reactivate` возвращает. Авто: суточная джоба `deactivate-inactive-users` (порог `INACTIVITY_DEACTIVATION_DAYS`, 90 дн.); тест `npx vitest run test/deactivation.spec.ts`.
- Лицензии (T-026): `GET /license/usage` (Admin+`X-Tenant-Slug: demo`) — план demo, дочки used/max 2/2, seats 2/5; Collaborator → 403. `POST /subsidiaries` сверх квоты — создаёт И возвращает warning (мягкая проверка ADR-0014); созданных сверх демо-набора дочек потом подчистить.
- Журналы (T-021): после логина — строка в `auth_event` (event/ip/user_agent), после `POST /subsidiaries` — в `audit_log` (action `subsidiary.created`, actor, after). Append-only: `psql -U app -d audit -c "UPDATE audit_log SET action='x'"` → permission denied.
- Soft-delete/comments (T-023): `DELETE /subsidiaries/:id` → 204, usage перестаёт считать удалённую; `POST /subsidiaries/:id/restore` возвращает (повторный — 404). `POST /comments` `{entityType, entityId, body}` → `GET /comments?entityType=&entityId=`; всё пишется в audit_log.
- Invite (T-015): `POST /invites` (Admin) `{email, roleId, isAuditSeat, locale}` → письмо в Mailpit с `token=` в тексте; до accept логин 401; `POST /invites/accept` `{token, password}` (слабый — 400) → 204 → логин приглашённого работает, seat считается в usage; в audit_log — `membership.granted` (LOG-05) и `invite.accepted`.
- OIDC SSO (T-016): `curl -i http://localhost:3001/auth/oidc/login` → 302 в Keycloak; полный код-флоу без браузера: страница логина → распарсить `action=` формы → POST `username=sso-user&password=Sso-User-2026` с cookie-jar → 302 на callback с кодом → `GET callback` отдаёт наш `{accessToken}`; `/auth/me` = sso-user@demo.io; повторный код → 401; JIT-юзер в БД с `password_hash IS NULL`.
- SAML SSO (T-024): готовый сценарий `bash <scratchpad>/saml-e2e.sh` или руками: `GET /auth/saml/login` → 302 на `.../protocol/saml?SAMLRequest=`; логин sso-user (те же креды, cookie-jar) → HTML с авто-submit формой → выдернуть `name="SAMLResponse" value="..."` → `POST /auth/saml/callback` (`--data-urlencode SAMLResponse=...`) → `{accessToken}`, `/auth/me` = sso-user@demo.io; **повторный SAMLResponse → 401** (InResponseTo-кэш, он in-memory — replay проверять на том же процессе api). Конфиг IdP api тянет из метадаты `:8081/realms/it-audit/protocol/saml/descriptor` при первом обращении. ⚠ Правки realm-json Keycloak применяются только пересозданием контейнера: `docker compose up -d --force-recreate keycloak` (dev-режим, H2 внутри контейнера — импорт заново) + подождать healthy ~30с.
- Frameworks (T-030): `GET /frameworks` (Bearer) — 3 глобальных из seed (ISO/IEC 27001 2022, COBIT 2019, NIST CSF 2.0, published; `?locale=`, `?tenantSlug=` добавит тенантские адаптации); без Bearer → 401. Requirements в БД: `framework_requirement` (ISO — 3, COBIT/NIST — по 2). RLS как у role: `psql -U app` без контекста видит только tenant_id NULL. UI: /frameworks за логином (cookie) — таблица `data-testid="frameworks-table"` с тремя стандартами, локализуется cookie locale; без сессии → 307 /login. Откат: `pnpm db:migrate:down` = 0009.
- Controls (T-031): `GET /controls` (Bearer; ?locale, ?tenantSlug) — 31 контроль из шаблона клиента (16 доменов; сид-данные `apps/api/src/seed-data/global-controls.ts` — сгенерированы из xlsx, руками не править); у GOV-01 standards = ISO/IEC 27001 A.5.1 + COBIT EDM01, у AM-01 — NIST CSF ID.AM (демо-маппинги, полные — EP-FWK). UI: /controls за логином — таблица `data-testid="controls-table"`, бейджи стандартов (в HTML между текстами React вставляет `<!-- -->` — при grep убирать). Откат: 0010.
- Control detail (T-032): `GET /controls/:id?tenantSlug=demo` — карточка одним ответом (owner, standards — у адаптации наследуются от оригинала, history из audit_log с актором, comments); `GET /auth/me/tenants` (Bearer) → `[{slug:"demo",name,role}]` — активный тенант UI (первый membership). Сид: тенантская адаптация GOV-01 в demo (owner admin, история control.adapted, коммент «CBAR checklist»); в списке `?tenantSlug=demo` — 32 строки (GOV-01 дважды: global+adapted). UI: /controls/<id> за логином — все блоки; id адаптации брать из API. ⚠ Грепать надо конкретные ЗНАЧЕНИЯ (Demo Admin…), не ключи переводов: словарь next-intl сериализован в HTML каждой страницы — «Tenant adaptation» найдётся везде.
- Engagement (T-035): всё под Bearer+`X-Tenant-Slug: demo` (PermissionGuard: Collaborator create→403, view→200). `POST /engagements` `{subsidiaryId, titleI18n, auditTypeCode: "it", mode: formal|light, milestones:[{stage, plannedDate}]}` → draft; `POST /engagements/:id/transition {to}`: formal — только следующая стадия (скип→400), light — скип разрешён только через согласовательные (manager_review/management_response/approval); пауза из любого рабочего, resume только в pausedFromState, archived только из closed (ставит archivedAt). Вход в стадию проставляет actual_date вехи (нет вехи — создаёт). `GET /engagements/:id` — allowedTransitions[] + вехи план/факт. Всё в audit_log (engagement.created/state_changed). UI: /engagements и /engagements/<id> (кнопки переходов — server actions; вехи план/факт таблицей).
- Чеклист (T-036): `POST /engagements/:id/checklist-items {controlIds:[...]}` (Bearer+X-Tenant-Slug, engagement.edit; Collaborator → 403) → `{added:n}`, повтор тех же → `{added:0}`; пункты — СНАПШОТЫ (objective/question скопированы в checklist_item — правка библиотеки их не меняет); `GET /engagements/:id` содержит `checklist[]` (локализованный). UI: секция «Чеклист» в карточке engagement — таблица + форма добавления (чекбоксы библиотеки без уже включённых). Откат: 0012.
- UI-логин (T-047): готовый сценарий `node <scratchpad>/ui-login-e2e.mjs` (нужны api+web) — no-JS submit server actions: из HTML формы взять **все** hidden `$ACTION_*`-поля (у `$ACTION_REF_N` нет value — не потерять!) + поля формы, POST multipart на URL страницы; успех = 303 + `Set-Cookie session=` (httpOnly). Проверяет: логин admin@demo.io, /account (email юзера, `data-testid="account-*"`), guard без cookie → redirect /login, неверный пароль → `data-testid="login-error"`, MFA-юзер → второй шаг (`mfa-code`, hidden mfaToken) → TOTP → 303, logout → cookie очищена. Тест-юзера `mfa-ui-*@demo.io` после прогона удалить из БД. Дизайн-токены — `design-system/it-audit-platform/MASTER.md` (Tailwind `@theme` в globals.css).
- i18n (T-022): `GET /subsidiaries` (Bearer+`X-Tenant-Slug: demo`) — `name` на локали юзера; `?locale=ru` → «Демо-банк», `?locale=az`, невалидная → 400; сущность без перевода падает на EN (fallback). UI: переключатель `data-testid="locale-en|az|ru"` пишет cookie и делает router.refresh(). Каталоги переводов `apps/web/src/messages/*.json` — тест паритета ключей `npx vitest run src/messages` (из apps/web).
- LDAP (T-025): `POST /auth/ldap/login` `{"username":"ldap-user","password":"Ldap-User-2026"}` → `{accessToken}`, `/auth/me` = ldap-user@demo.io (JIT, `password_hash IS NULL`); username может быть и mail. Неверный пароль/неизвестный юзер → 401 (+строка `failed` в auth_event), пустой пароль → 400 (гард от анонимного bind). Сид-юзеры — `infra/ldap/*.ldif`, применяются только при первом старте контейнера (правки = `docker compose up -d --force-recreate ldap`). Прямая проверка LDAP: `docker exec it-audit-platform-ldap-1 ldapsearch -x -D cn=admin,dc=demo,dc=io -w admin -b ou=people,dc=demo,dc=io '(uid=ldap-user)'`.
- MFA (T-014): готовый сценарий `bash <scratchpad>/mfa-e2e.sh` или руками: `POST /auth/mfa/setup` (Bearer) → `{secret, qrDataUrl}`; TOTP-код: `node -e "console.log(require('<repo>/apps/api/node_modules/otplib').generateSync({secret:'...'}))"` (запускать с резолвом из apps/api!); `POST /auth/mfa/enable {code}` → 10 recovery-кодов; логин становится двухшаговым (`{mfaRequired, mfaToken}` → `POST /auth/mfa/verify`); recovery-код одноразов (10→9, повтор — 401).
- ⚠ Гоча портов: если 3001 занят «бессмертным» процессом — ищи родителя `nest start --watch` (`fuser 3001/tcp` → `ps -o ppid`), он воскрешает убитого ребёнка; гасить надо всё дерево (pkill -f 'nest start').
- Фоновые задачи (T-040): `curl -X POST 'http://localhost:3001/jobs/demo?delayMs=2000'` → `{id}`; сразу `GET /jobs/demo/<id>` — `state:"delayed"`, через ~3с — `completed` с `returnValue`. `GET /jobs/heartbeat` — свежий `lastRunAt` (repeatable-джоба: первый прогон при старте api, дальше раз в минуту).
- Email (T-041): `curl -X POST http://localhost:3001/email/demo -H 'Content-Type: application/json' -d '{"locale":"ru"}'` → `{messageId}`; письмо видно в Mailpit UI :8025 или `curl http://localhost:8025/api/v1/messages`. Локали en/az/ru; невалидная локаль → 400.
- Файлы (T-042): `curl -X POST http://localhost:3001/files -F file=@<путь>` → `{key}`; скачать `curl 'http://localhost:3001/files/content?key=<key URL-энкоженный>'` и сравнить байты (`cmp`). Отсутствующий ключ → 404. Ключи с кириллицей в query энкодить, иначе 400 от самого запроса.

(Доменный seed пока пуст — расти будет вместе со схемой, дополнять этот файл начиная с T-010.)
