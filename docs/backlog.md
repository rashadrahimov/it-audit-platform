# Backlog — IT Audit Platform

**Это единственный источник правды по задачам.** Не держим задачи в голове, в чате или в сессионных списках — только здесь. Основано на: требованиях клиента, [ADR](adr/), [gap-analysis.md](vanta-research/gap-analysis.md) (решение: полный паритет с Vanta + наши добавки).

---

## ▶ СЕЙЧАС (обновлять в конце каждой сессии — 1 строка)

- **Текущая задача:** T-046 закрыта (onboarding: вычисляемые шаги, виджет на /account). Следующая — T-034 (Document/Evidence; deps T-031 ✓, T-042 ✓ — незаблокирована).
- **Следующий шаг:** T-034 → потом только `[!]`-развязки (T-012, T-043 — решения за Рашадом; T-033/T-038+ ждут T-043). GitHub-remote не заведён.
- **Последнее готово:** **Марафон 18.07.2026: T-024, T-025, T-022, T-047, T-030, T-031, T-032, T-035, T-036, T-037, T-046 (11 задач)**. Открыто у заказчика: Excel-шаблоны, регулятор, оплата.

_Это первое, что читает новая сессия. Всегда держи здесь актуальные 3 строки._

## Как этим пользоваться (правила, чтоб не перепрыгнуть и не забыть)

1. **Стабильные ID.** Задачи нумеруются `T-001`, `T-002`… Номер присваивается один раз и НИКОГДА не переиспользуется и не меняется, даже если задача удалена. Ссылки (`deps: T-003`) так не ломаются.
2. **Rolling-wave планирование.** Атомарно расписаны только Milestone 0 и 1 (то, что делаем сейчас/следующим). Milestone 2-3 и «Добавки» пока держим как эпики — распишем на атомы, когда до них дойдём. Расписывать все фазы на атомы сейчас — трата: детали изменятся.
3. **Строгий порядок зависимостей.** У каждой задачи указаны `deps`. Задачу с невыполненными зависимостями НЕ начинаем — она заблокирована. Это и есть защита от «перепрыгнуть».
4. **Definition of Done (DoD)** у каждой задачи — критерий «готово». Пока не выполнен DoD, задача не закрывается (`[ ]` → `[x]`).
5. **Вертикальные срезы, не горизонтальные.** После фундамента строим один тонкий сквозной путь (1 фреймворк → 1 контроль → 1 тест → 1 finding → 1 письмо), а не «сначала все таблицы, потом весь UI». Так есть что показать клиенту каждые 2-4 недели (ADR-0007) и модель проверяется рано.
6. **Каждую задачу завершаем проверкой** (скилл `/verify`) — увидеть, что работает в реальном приложении, а не только компилируется.
7. **Дизайн UI — через скилл `ui-ux-pro-max`** (установлен). Запускать перед версткой любого экрана.
8. **ADR обновляем на ходу.** Если задача вынуждает архитектурное решение — новый ADR до/во время задачи.

Обозначения: `[ ]` открыта · `[x]` готово · `[~]` в работе · `[!]` заблокирована.

---

## Работа по сессиям (когда начинать новую и с каким промтом)

### Когда переходить в НОВУЮ сессию
- **Одна сессия ≈ одна задача или один вертикальный срез**, а не весь проект. Закрыл T-0XX и проверил — новая сессия. _Исключение — автономный режим (промт E): задач за сессию сколько успеется, страховка — зелёный чекпоинт (commit) после каждой._
- **При смене типа работы**: планирование → кодинг → ревью/verify. Разные режимы — разные сессии.
- **Когда контекст раздулся**: заметил, что ответы стали длиннее/повторяются, или прошла суммаризация — заканчивай и начинай свежую. Длинный контекст = потеря деталей.
- **НЕ переключайся посреди задачи.** Доведи до «зелёного» чекпоинта (собирается + verify прошёл + бэклог обновлён + закоммичено), потом переключайся.

### Ритуал ЗАВЕРШЕНИЯ сессии (чтобы следующая подхватила без потерь)
1. Проставить `[x]` у сделанных задач в этом файле.
2. Обновить блок **▶ СЕЙЧАС** вверху (3 строки: текущая / следующий шаг / последнее готово).
3. Закоммитить (после T-005): `git add -A && git commit` с осмысленным сообщением — git log станет картой «где я».
4. Если задача вскрыла архитектурное решение — дописать ADR.
5. **Выдать готовый промт для следующей сессии** (заполненный шаблон A/B/C/D ниже, скопировать-и-вставить): конкретная задача, какие файлы прочитать, DoD. Это же правило действует, если контекст заполнился ПОСРЕДИ задачи — перед обрывом выдать промт «продолжить T-0XX с шага …».

### Промт для СТАРТА новой сессии (копировать нужный)

Память (`MEMORY.md`) подгружается автоматически — промт лишь направляет в бэклог и на конкретную задачу.

**A. Продолжить с того же места (самый частый):**
```
Продолжаем IT Audit Platform. Прочитай docs/backlog.md (блок «СЕЙЧАС» вверху);
если репозиторий уже под git — глянь git log -5. Скажи, на чём остановились, и
возьми следующую незаблокированную задачу — сверься с её deps перед началом.
Сначала план, потом код.
```

**B. Конкретная задача:**
```
Работаем над T-0XX из docs/backlog.md. Прочитай саму задачу, её deps, а также
docs/data-model.md и профильные ADR в docs/adr/. Покажи план на задачу и её
Definition of Done, затем делай. В конце — /verify и обнови бэклог.
```

**C. Проектирование (ERD / архитектура):**
```
Сессия проектирования IT Audit Platform, задача T-003 (ERD). Прочитай
docs/backlog.md, все docs/adr/, docs/vanta-research/gap-analysis.md и CONTEXT.md.
Спроектируй модель данных целиком; не пиши код — только docs/data-model.md.
```

**D. Верстка экрана (UI):**
```
Верстаем экран <название> для IT Audit Platform. Сначала вызови скилл
ui-ux-pro-max, потом docs/backlog.md по задаче. Покажи дизайн-подход до кода.
```

**E. Автономный марафон (без моего участия; вставлять после `/goal` — stop-hook не даст закончить раньше времени):**
```
/goal Автономный марафон IT Audit Platform. Прочитай docs/backlog.md (блок «СЕЙЧАС»)
и git log -5, затем работай по CLAUDE.md (раздел «Автономный режим») задачу за
задачей, пока есть незаблокированные: план → код → /verify (реальный запуск по
.claude/skills/verify/SKILL.md, не только тесты) → [x] в бэклоге → обновить блок
«СЕЙЧАС» → git commit — только после такого зелёного чекпоинта брать следующую.
Перед версткой любого экрана — скилл ui-ux-pro-max; если задача вскрыла
архитектурное решение — ADR. Вопросов мне не задавать: всё, что требует моего
решения (архитектура вне ADR, вопрос клиенту, деструктивное/внешнее действие),
— пометить задачу [!] с причиной и взять следующую незаблокированную. Задача
буксует (2 провала /verify подряд) — тоже [!] с причиной и следующая, марафон
не останавливать. После суммаризации контекста первым делом перечитать
docs/backlog.md (блок «СЕЙЧАС») и git log -5 — источник правды файлы, а не
память сессии. Закончить только когда незаблокированных задач не осталось:
тогда ритуал завершения из backlog.md и готовый промт следующей сессии.
```

_Правило промта: не пересказывать контекст руками — указывать, какие ФАЙЛЫ прочитать. Файлы — источник правды, пересказ устаревает._

---

## M-1. ПЕРЕД началом кодинга (Definition of Ready проекта)

Это pre-work. Пока он не сделан — не начинаем M0. Отвечает на «что лучше сделать перед началом работы».

- [~] **T-001** — Закрыть открытые вопросы клиента (из [grill-сессии](adr/)): on-prem/облако, тип AD, стандарты, язык отчётов, размер группы, форматы экспорта, модель контракта. _Deps: —._ DoD: ответы записаны в [client-answers.md](client-answers.md). **Ответы получены (деплой оба; on-prem→AD/SAML/LDAP в MVP, SaaS→OIDC; стандарты ISO27001/COBIT/NIST/местный; отчёты EN+AZ; экспорт PDF+Word+Excel; лицензия per-subsidiary+seat).** Открыто у клиента: Excel-шаблоны чеклистов, какой местный регулятор, модель оплаты.
- [x] **T-002** — Обновить ADR под находки gap-анализа. _Deps: —._ DoD: созданы ADR-0010 (Tests-слой), 0011 (Integrations), 0012 (Access/IAM), 0013 (RBAC-матрица), 0014 (лицензирование); обновлён 0006 (SAML/LDAP в MVP). Глоссарий CONTEXT.md дополнен (Test, Connector, Account, Role, Permission).
- [x] **T-003** — Спроектировать модель данных (ERD) целиком до кода: Tenant, Subsidiary, Department/Unit, User+Membership (ADR-0015), Role, Permission, Framework, Control (global+tenant, ADR-0016), Test, Document/Evidence, Engagement, Response (+Compliance Status из чеклиста клиента), Finding, Risk, Asset, Vendor, Policy, Notification, AuditLog, License/Quota (ADR-0014). **+ RFP-сущности (ADR-0017): Audit Type, Audit Universe (дерево), Working Paper, Audit Program, Time Entry, крючки под custom fields (GEN-07) и конфигурируемую терминологию (GEN-06).** Enum'ы из checklist-analysis.md. С мультиязычными полями (ADR-0009) и tenant_id везде; **схема обязана не закрывать опцию schema-per-tenant изоляции для строгих клиентов (MTE-04 RFP)**. _Deps: T-002._ DoD: ERD-документ `docs/data-model.md` + схема (текст/диаграмма), отревьюен. **ERD пишется так, чтобы стать основой документа DAT-02 RFP (документированная модель данных).** _Статус: **утверждена Рашадом 18.07.2026** (зафиксировано в шапке data-model.md; открытые вопросы §11 приняты по дефолтам). Бэклог синхронизирован автономной сессией._
- [x] **T-004** — Финализировать стек-детали поверх ADR-0008. _Deps: —._ DoD: **ADR-0018**: монорепо pnpm (apps/api NestJS + apps/web Next.js + packages/shared), Drizzle, Tailwind+shadcn/ui+TanStack Table+Recharts, Zod, Vitest+Playwright, Tiptap, next-intl.
- [x] **T-005** — Инициализировать репозиторий: git, структура папок, TypeScript, линт/форматтер, CI (build+lint+test), `.env.example`. _Deps: T-004._ DoD: `git init`, пустое приложение собирается в CI. **Готово: монорепо pnpm (catalog версий), api NestJS 11 + OpenAPI, web Next.js 15 + Tailwind 4, shared со сквозным zod-контрактом `/health`, ESLint 9 flat + Prettier, GitHub Actions (install→build→lint→typecheck→format→test — прогнано локально; Actions запустится при первом push, remote пока нет).**
- [x] **T-006** — Поднять локальную инфраструктуру: Postgres, Redis, S3-совместимое (MinIO), SMTP-заглушка (Mailpit) через docker-compose. _Deps: T-005._ DoD: `docker compose up` поднимает всё; app коннектится. **Готово: docker-compose.yml (Postgres 17, Redis 7, MinIO + one-shot mc-контейнер создаёт бакет audit-files, Mailpit; healthchecks, volumes, пиненые образы). Хост-порты 5433/6380 — стандартные заняты соседним проектом. «App коннектится» доказано кодом: `GET /health/infra` в api реально подключается ко всем четырём (pg SELECT 1, ioredis PING, S3 HeadBucket, SMTP-приветствие), при недоступности — 503/degraded с ошибкой по сервису; zod-контракт в shared; маршрут виден в OpenAPI.**
- [x] **T-007** — Настроить проектный `/verify`-харнесс и seed-скрипт демо-данных. _Deps: T-006._ DoD: одна команда запускает app с сид-данными; verify описан. **Готово: `pnpm dev:up` = `infra:up` (compose + `scripts/wait-infra.mjs`, т.к. `--wait` спотыкается об one-shot minio-init) → build → seed → оба dev-сервера. Seed (`pnpm seed`, apps/api/src/seed.ts) идемпотентен: гарантирует бакет audit-files, кладёт demo/welcome.txt, проверяет Postgres/Redis; доменные сид-данные добавятся со схемой (T-010+). Скилл verify переписан под dev:up; env-дефолты вынесены в apps/api/src/env.ts.**

---

## M0. Фундамент (не ретрофитится — строим до любых фич)

Ошибки здесь потом почти не исправить. Всё в этом разделе должно быть готово до M1.

### Эпик: Мультитенантность (ADR-0003)
- [x] **T-010** — Базовая схема + миграции: таблицы Tenant, Subsidiary, `tenant_id` во всех доменных таблицах. _Deps: T-003, T-006._ DoD: миграции применяются, откатываются. **Готово: Drizzle (ADR-0018), схема `apps/api/src/db/schema.ts` по data-model §1/§2 (uuid v7 app-side — в PG17 нет uuidv7(), name_i18n jsonb, timestamps, soft-delete, tenant_id NOT NULL + индекс); `pnpm db:generate/db:migrate/db:migrate:down`; отката у drizzle-kit нет — парные `drizzle/down/<tag>.down.sql` + раннер; полный цикл up→down→up проверен; seed сидит tenant «demo»+дочку demo-bank (идемпотентно); db:migrate встроен в dev:up.**
- [x] **T-011** — Row-Level Security: RLS-политики Postgres по `tenant_id`, установка контекста тенанта на каждый запрос. _Deps: T-010._ DoD: тест доказывает, что запрос из тенанта A не видит данные тенанта B даже при «забытом» фильтре в коде. **Готово: миграция 0001 — роль `app` без суперправ (суперюзер-владелец обходит RLS — поэтому рантайм ходит под `app`, миграции под `audit`; DATABASE_URL/DATABASE_URL_OWNER), ENABLE+FORCE RLS, политика `tenant_isolation` (USING+WITH CHECK, NULLIF-каст = default deny); `DbService.withTenant()` — set_config в транзакции (ADR-0018); 4 интеграционных теста (test/rls.spec.ts): забытый фильтр, симметрия, default deny, WITH CHECK. Контекст «на каждый HTTP-запрос» подключится к auth-guard в T-013/T-020. ⚠ CI при заведении remote потребует services: postgres для rls.spec.**
- [!] **T-012** — Групповой уровень: агрегирующие запросы по всем дочкам внутри тенанта, с проверкой прав. _Deps: T-011._ DoD: эндпоинт возвращает агрегат по группе, дочки друг друга не видят. **[!] причина (автономная сессия 18.07.2026): «с проверкой прав» и «дочки друг друга не видят» требуют membership+membership_scope и enforcement (T-013, T-018–T-020) — их ещё нет. Предлагаю deps: T-011, T-013, T-020 — решение за Рашадом.**

### Эпик: Аутентификация (ADR-0006)
- [x] **T-013** — Локальные аккаунты: регистрация/логин по паролю (хеш), сессии/JWT. **+ конфигурируемая парольная политика per tenant (длина/сложность/expiry/lockout), предупреждение об истечении, self-service смена (SEC-01/02 RFP).** _Deps: T-010._ DoD: логин работает, пароль захеширован, политика настраивается. **Готово: таблица `user` (миграция 0002, над-тенантная, поля MFA/lockout заготовлены), scrypt-хеш на node:crypto (без нативных зависимостей, параметры в строке хеша), JWT (@nestjs/jwt, JWT_SECRET/TTL в env), JwtAuthGuard; политика: дефолт + merge из `tenant.settings.passwordPolicy` (проверено minLength 20), lockout 5×15мин (проверен: верный пароль отвергается в локе), self-service смена (старый пароль умирает). Эндпоинты /auth/register|login|me|change-password в OpenAPI; юнит-тесты хеша и политики. Не в скоупе: предупреждение об истечении пароля (expiryDays в политике заготовлен — сама проверка/письмо логично лягут в T-040-джобу при T-039-нотификациях), «сессии» как хранимые refresh-токены (MVP: короткий JWT).**
- [x] **T-014** — TOTP MFA: включение, QR, проверка кода, recovery-коды. _Deps: T-013._ DoD: логин с MFA проходит end-to-end. **Готово: otplib v13 + qrcode (оба чистый JS); `POST /auth/mfa/setup` (секрет + otpauth-URI + QR data-URL), `/enable` (проверка кода → 10 одноразовых recovery-кодов, в БД sha256-хеши), `/verify` (второй шаг логина: mfaToken 5 мин + TOTP или recovery; recovery сжигается), `/disable`; login при mfa_enabled возвращает `{mfaRequired, mfaToken}` (union-контракт в shared); mfa.enabled/disabled в audit_log. Гоча otplib v13 (кидает TokenLengthError на не-6-значных) обёрнута. E2e: весь цикл включая сжигание recovery.**
- [x] **T-015** — Invite-flow: инвайт по email → подтверждение → создание аккаунта. _Deps: T-013, T-041(email)._ DoD: приглашённый пользователь заходит. **Готово: `POST /invites` (админ; user `invited` + membership с invited_by, мультиязычное письмо с JWT-токеном purpose=invite на 7 дней, мягкие квота-warnings T-026, запись LOG-05 `membership.granted`); `POST /invites/accept` (валидация токена и пароля по политике, активация user+membership); e2e через Mailpit: письмо ru, логин до accept 401, слабый пароль 400, после accept — логин работает, seat метрится. Повторный инвайт в тот же тенант — 409.**
- [x] **T-016** — OIDC SSO (для SaaS-клиентов): вход через Entra ID/Google. _Deps: T-013._ DoD: SSO-логин работает на тестовом IdP. **Готово: Keycloak 26.4 в docker-compose (:8081, dev-режим, realm `it-audit` автоимпортом из infra/keycloak: confidential-клиент + тестовый sso-user; healthcheck через /dev/tcp — в образе нет curl); openid-client v6 с discovery — Entra ID/Google подключаются сменой OIDC_* env без правок кода; `GET /auth/oidc/login` (302, state = подписанный JWT 10 мин) → `/callback` (обмен кода, повторный код → 401, JIT-провижининг по email: password_hash NULL, auth_event с IP, user.sso_provisioned в audit_log; invited-юзер активируется SSO-входом). E2e: полный code-flow curl'ом. Отложено осознанно: PKCE/nonce (confidential client + state-JWT достаточно для MVP), redirect с httpOnly-cookie (появится с фронтом T-022+).**
- [x] **T-024** — SAML/ADFS SSO (для on-prem клиентов, ADR-0006). _Deps: T-013._ DoD: SAML-логин против тестового IdP. **Готово: @node-saml/node-saml v5 (чистый JS, ядро passport-saml); конфиг IdP — из его метадаты (`SAML_IDP_METADATA_URL`, дефолт — SAML-descriptor realm'а it-audit; для ADFS — FederationMetadata.xml, формат тот же): cert подписи Keycloak генерирует при импорте, в env его не запинишь. `GET /auth/saml/login` (302 с AuthnRequest, redirect-binding) → `POST /auth/saml/callback` (POST-binding; обязательные подписи Response и Assertion, audience, InResponseTo-сверка = CSRF/replay-защита — повторный SAMLResponse → 401, кэш in-memory); NameID=email; JIT-провижининг вынесен в общий `SsoUserService` (OidcService рефакторнут на него). SAML-клиент `it-audit-saml` в realm-json (подписи server+assertion, мапперы email/firstName/lastName, client-signature off — SP-ключей в MVP нет; правки realm применяются пересозданием контейнера Keycloak). E2e-флоу curl'ом целиком (без браузера). Попутно: починен сломанный lint — node-глобалы для `scripts/**/*.mjs` в eslint.config.**
- [x] **T-025** — LDAP-федерация к локальному AD (on-prem). _Deps: T-013._ DoD: логин по LDAP-учётке. **Готово: тестовый LDAP в compose (osixia/openldap:1.5.0, :1389, base dc=demo,dc=io, сид `infra/ldap/users.ldif` — применяется при первом старте контейнера); `ldapts` (чистый JS); `POST /auth/ldap/login` — search+bind (AD-совместимый паттерн: сервисный аккаунт ищет DN по `LDAP_SEARCH_FILTER`, потом bind кредами юзера — пароль проверяет сам LDAP и у нас не хранится); для AD достаточно сменить env (`(sAMAccountName={{username}})` и т.п.). Безопасность: экранирование фильтра (RFC 4515, от LDAP-инъекции), пустой пароль → 400 (гард от анонимного bind), неоднозначный фильтр (2 совпадения) → отказ, одинаковый 401 для «нет юзера»/«не тот пароль», failed-события в auth_event (LOG-04); локальные lockout/политика не применяются — пароль чужой (AD). JIT — общий SsoUserService. E2e: логин по uid и по mail, 401/400-кейсы, JIT-юзер с `password_hash IS NULL`.**
- [x] **T-047** — UI-логин (каркас авторизации веба): страница входа (+второй шаг MFA), httpOnly-cookie с токеном, server-side fetch к API с токеном из cookie, logout, редирект приватных страниц на /login. _Deps: T-013, T-014, T-022._ DoD: логин через браузер работает (включая MFA-аккаунт), приватная страница показывает юзера, logout разлогинивает. _(Добавлена марафоном 18.07.2026: все UI-DoD M1 (T-030 «список в UI», T-032, T-044…) невыполнимы без входа в браузере — задачи на это не было.)_ **Готово: дизайн-система ui-ux-pro-max (Trust & Authority, navy+#0369A1, Plus Jakarta Sans self-hosted через next/font — без внешних запросов в рантайме; токены в Tailwind `@theme`, MASTER.md в design-system/); server actions: login (union-контракт → cookie либо MFA-шаг на той же карточке), mfa/verify, logout; `session` httpOnly/lax, maxAge = expiresInSeconds токена; `getSessionUser()`/`apiFetch()` в lib/session — серверный fetch с Bearer из cookie; /account — первая приватная страница (без сессии → /login); формы: видимые label, ошибки `role="alert"` у поля, pending-state кнопки, autocomplete/one-time-code, фокус-кольца; строки — en/az/ru. E2e без браузера: no-JS submit server actions (hidden $ACTION_*-поля + multipart, 303+Set-Cookie) — весь DoD включая MFA и logout.**
- [x] **T-017** — Авто-деактивация: деактивация аккаунта при offboarding/inactive. _Deps: T-013._ DoD: деактивированный не логинится. **Готово: UsersModule — `POST /users/:id/deactivate|reactivate` под PermissionGuard (settings.edit как прокси админ-права до расширения каталога ресурсов); авто-деактивация — суточная BullMQ-джоба `deactivate-inactive-users` (неактивен > INACTIVITY_DEACTIVATION_DAYS, дефолт 90; 0 = выкл; для ни разу не входивших — от created_at); login отбивает деактивированных (заложено в T-013). Тест 4 шт. (deactivation.spec) + e2e 403/204/401/204/200. Деактивация из HR-коннектора при offboarding — придёт с EP-INT.**

### Эпик: RBAC-матрица (B14)
- [x] **T-018** — Модель Permission (ресурс/действие) + Role + связь роль↔права как матрица (No access/View/Edit). _Deps: T-003._ DoD: матрица хранится, читается. **Готово: миграция 0003 — `permission` (глобальный каталог, UNIQUE resource+action), `role` (tenant_id NULL = пресет; RLS без FORCE: глобальные читаемы всеми, писать app может только тенантские), `role_permission` (level none/view/edit, RLS через EXISTS к role); seed: каталог 5×6=30 прав + демо-роль «Демо-аудиторы» с полной матрицей; чтение `GET /rbac/permissions` и `GET /rbac/roles[?tenantSlug=]` под JWT-guard (tenantSlug — временно, до контекста из membership в T-020); откат 0003 проверен.**
- [x] **T-019** — Пресет-роли: Admin, View-only Admin, Editor, Collaborator + аудит-иерархия (assessor/manager/approver) + категории (аудитор/end user/MSP). _Deps: T-018._ DoD: пресеты сидятся. **Готово: 7 системных ролей (tenant_id NULL, is_system) с полными матрицами 30 ячеек — сидятся идемпотентно под owner-подключением (RLS-политика записи не пускает app к глобальным); имена мультиязычные EN/AZ/RU; читаются глобально через /rbac/roles. Категории (auditor/end user/MSP) — поле membership.category: появится вместе с таблицей membership (T-020), сюда не входит.**
- [x] **T-020** — Enforcement: middleware/guard, проверяющий право на действие; UI прячет недоступное. _Deps: T-019._ DoD: тест — Collaborator не может Edit там, где нет права. **Готово: таблица `membership` (миграция 0004, ADR-0015: user↔tenant↔role, category/is_audit_seat, UNIQUE(user,tenant); над-тенантная — без RLS, читается до установления контекста); `@RequirePermission(resource, action, level)` + `PermissionGuard` (тенант из `X-Tenant-Slug` до UI-переключателя; резолв матрицы внутри withTenant — RLS-совместимо; guard кладёт tenantId в request); `GET /rbac/check` — уровни для UI («прячет недоступное» — UI-экраны будут потреблять его); демо-юзеры в seed (Admin/Collaborator). DoD-тест rbac-enforcement.spec (4 шт.): Collaborator settings.edit→none/запрет, engagement view да/edit нет, finding.edit да, Admin всё, чужой тенант — нет; e2e: 403/201/400.**

### Эпик: Сквозные примитивы
- [x] **T-021** — Скелеты доменных сущностей + `AuditLog` (History): кто/что/когда менял, версионирование. **+ журнал логин/логаут с IP (LOG-04) и записи о выдаче доступа — кто/кому/когда дал права (LOG-05).** _Deps: T-010._ DoD: изменение сущности пишет запись в audit log; вход пишется с IP. **Готово: миграция 0006 — `audit_log` (before/after jsonb, prev_hash/hash заложены под EP-HARDEN; RLS-чтение по тенанту, INSERT свободен, UPDATE/DELETE отозваны у app — проверено permission denied) и `auth_event` (login/failed/locked с ip/user_agent). AuditLogService (Global, ошибки записи не роняют операцию); подключено: login (все исходы, с IP), POST /subsidiaries (subsidiary.created с actor+after), деактивация юзера. «Скелеты сущностей» идут по своим задачам (уже есть 8 таблиц по утверждённому ERD) — отдельных пустых таблиц не создавалось. LOG-05 (выдача прав) подключится к membership-CRUD в T-015; logout-событие — когда появится logout (сейчас stateless JWT).**
- [x] **T-022** — Мультиязычные поля (ADR-0009): хранение перевода строк контента с fallback на EN; i18n-каркас UI. _Deps: T-003._ DoD: сущность отдаёт название на выбранном языке. **Готово: контракт `i18nTextSchema`/`I18nText` и generic `resolveLocalized` — в shared (email-шаблоны и схема БД рефакторнуты на них, тесты в shared); `GET /subsidiaries` — `name` на языке из `?locale=` (невалидный → 400) или локали юзера, fallback EN проверен e2e (en-only сущность при ru). UI-каркас: next-intl без URL-префикса — локаль в cookie (`src/i18n/request.ts`), каталоги `src/messages/{en,az,ru}.json` + тест паритета ключей, `<html lang>` из локали, страница статуса переведена, клиентский LocaleSwitcher (cookie + router.refresh). Верстки новых экранов не было — ui-ux-pro-max не звался, экраны придут в T-030+ со скиллом. `@parcel/watcher` (транзитивный next-intl) запрещён в allowBuilds по политике «без нативных сюрпризов».**
- [x] **T-023** — Soft-delete + comments на сущностях. _Deps: T-021._ DoD: удаление обратимо; коммент добавляется. **Готово: `DELETE /subsidiaries/:id` (soft, deleted_at) + `/restore` (повторный — 404); метринг лицензий не считает удалённых; полиморфная таблица `comment` (миграция 0007, FORCE RLS, soft-delete-поле) + `POST/GET /comments`; все действия в audit_log. Паттерн для будущих сущностей: deleted_at + isNull-фильтр в выборках.**
- [x] **T-040** — Фоновые задачи: BullMQ + Redis, планировщик (cron-джобы для напоминаний). _Deps: T-006._ DoD: тестовая отложенная задача выполняется. **Готово: @nestjs/bullmq, очередь `system`, worker in-process (ADR-0008); планировщик — `upsertJobScheduler` (repeatable heartbeat раз в минуту, поддерживает и cron-pattern); демо-эндпоинты `POST /jobs/demo` (отложенная задача) / `GET /jobs/demo/:id` / `GET /jobs/heartbeat`; проверено: delayed→completed с returnValue, heartbeat пишется. Нативный msgpackr-extract запрещён в allowBuilds (JS-фоллбек, без нативных сюрпризов on-prem).**
- [x] **T-041** — Email: провайдер-абстракция + SMTP, шаблоны писем (мультиязычные). _Deps: T-006._ DoD: письмо уходит в Mailpit. **Готово: интерфейс `EmailProvider` (DI-токен, ADR-0002) + `SmtpEmailProvider` (nodemailer); шаблоны EN/AZ/RU с fallback на EN (ADR-0009, `resolveLocalized` покрыт тестом); `POST /email/demo` шлёт через абстракцию — письма ru/en/az проверены в Mailpit API; `SMTP_FROM` в env; zod-контракты и `localeSchema` в shared.**
- [x] **T-042** — Файловое хранилище: S3-абстракция, загрузка/скачивание, привязка к сущностям. _Deps: T-006._ DoD: файл грузится и отдаётся. **Готово: `FileStorageService` (put/get за абстракцией, ADR-0002); `POST /files` (multipart до 25 МБ, ключ `uploads/<uuid>/<имя>`, UTF-8 имена) и `GET /files/content?key=` (стриминг, Content-Disposition RFC 5987); 404/400 корректны; проверено побайтовым сравнением с кириллическим именем. Привязка к сущностям — задел: entityType/entityId в метаданных объекта, настоящая таблица привязки придёт со схемой (T-010+).**
- [!] **T-043** — SLA-примитивы (B15): поля deadline/SLA + авто-статусы (OK/Due soon/Overdue) через фоновую джобу. _Deps: T-040._ DoD: статус пересчитывается по времени. **[!] причина (автономная сессия 18.07.2026): формальные deps выполнены, но авто-статусы нужны на полях `due_date`/`sla_status` сущностей finding/test (data-model §1) — их таблиц ещё нет. Предлагаю deps: T-040, T-010(+finding/test-скелеты) — решение за Рашадом.**
- [x] **T-026** — Лицензирование (ADR-0014): сущности License/Quota на тенант (лимиты по subsidiaries и audit-seats) + метринг потребления + мягкая проверка при создании дочки/добавлении аудитора. _Deps: T-010._ DoD: превышение квоты предупреждает; потребление считается. **Готово: таблица `license` (миграция 0005, FORCE RLS, UNIQUE на тенант; terms заготовлен под perpetual/subscription из T-001); `LicenseService.usage()` — метринг запросом (дочки без deleted_at, membership.is_audit_seat active) + `quotaWarnings()`; `GET /license/usage` (settings.view) и первый доменный CRUD `POST /subsidiaries` (settings.edit) с мягкой проверкой — создаёт и предупреждает, e2e проверено (3-я дочка: created + warning). Точка «добавление аудитора» подключит quotaWarnings при появлении membership-CRUD (T-015 invite). usage_snapshot (история для биллинга) — отложен до биллинга.**

---

## M1. Ядро аудита (вертикальный срез, ~60% ценности)

Строим тонкий сквозной путь. После M1 — первое серьёзное демо клиенту.

### Эпик: Библиотека и требования
- [x] **T-030** — Framework: сущность + сид приоритетных стандартов (ISO 27001/COBIT/NIST — из T-001) + версионирование. _Deps: T-021. Гейтится T-001._ DoD: список фреймворков в UI. **Готово: миграция 0009 — `framework` (tenant_id NULL=глобальная библиотека ADR-0016, version-строка «2022», status, source_framework_id для тенант-адаптаций; новая версия = новая строка, tracked changes — EP-FWK) + `framework_requirement` (ref A.5.1/EDM01…, title/text_i18n, parent_id-иерархия; единственный источник ссылок на стандарты — ADR-0004); RLS по паттерну role: глобальные читаемы всеми (в т.ч. без контекста), писать app может только тенантские; requirement наследует через EXISTS; up→down→up проверен. Сид под owner: ISO/IEC 27001:2022, COBIT 2019, NIST CSF 2.0 + примеры требований EN/AZ/RU (местный стандарт — когда клиент назовёт регулятора, T-001). `GET /frameworks` (Bearer; ?tenantSlug как у /rbac/roles до тенант-контекста UI, ?locale). UI: /frameworks за логином — локализованная таблица (название/версия/статус/источник), ссылка с /account. Гейт T-001 пройден в части приоритетных стандартов (записаны в ответах клиента).**
- [x] **T-031** — Control: сущность + библиотека контролей + маппинг Control↔Framework (много-ко-многим). _Deps: T-030._ DoD: контроль виден с его стандартами. **Готово: миграция 0010 — `control_domain` (16 доменов чеклиста), `control` (ADR-0016 global+override: origin_control_id, ref, 4 поля чеклиста objective/question + guidance, owner_membership_id под T-032, custom jsonb — задел GEN-07), `control_mapping` (M:N к framework_requirement, Vanta-паттерн); RLS по паттерну framework, mapping через EXISTS; up→down→up. Сид: 16 доменов + 31 контроль, **извлечённые программно из xlsx-шаблона клиента** (генерённый модуль seed-data/global-controls.ts; EN — переводы EP-I18N) + 6 демо-маппингов (GOV-01→ISO A.5.1+COBIT EDM01 и т.п.; полный мультифреймворк-маппинг — EP-FWK). `GET /controls` (Bearer, ?locale/?tenantSlug) — контроль с domain и standards[]. UI: /controls за логином — таблица с бейджами стандартов, ссылка с /account. DoD e2e: GOV-01 в UI с бейджами ISO/COBIT.**
- [x] **T-032** — Control detail: owner, domain, note, mapped elements, history, comments (как drawer Vanta). _Deps: T-031, T-021._ DoD: экран контроля открывается со всеми полями. **Готово: `GET /controls/:id` — карточка одним ответом (поля+guidance, owner через membership→user, standards с наследованием от оригинала у адаптаций, history из audit_log с резолвом актора, comments из T-023-таблицы); `GET /auth/me/tenants` + `getActiveTenantSlug()` в web — UI впервые получил тенант-контекст (первый membership; переключатель тенантов — отдельной задачей при мульти-тенант юзерах). Сид: демо-адаптация GOV-01 (ADR-0016 override: origin_control_id, owner=admin, guidance, запись control.adapted в audit_log, коммент) — экран живой, не пустой. UI: /controls/<id> (drawer-паттерн) — бейдж global/adaptation, все блоки, локализация; ref в списке — ссылка. Добавление/редактирование комментов в UI — с интерактивным UI-слоем (T-033+).**

### Эпик: Тесты и доказательства (B1)
- [ ] **T-033** — Test: сущность (Control 1→N Test), статус, owner, due date, SLA, «failing entities». _Deps: T-031, T-043._ DoD: тест привязан к контролю, статус меняется.
- [ ] **T-034** — Document/Evidence: ручные доказательства с owner, cadence, маппингом на фреймворк, статусом. _Deps: T-031, T-042._ DoD: документ-доказательство создаётся и привязывается.

### Эпик: Engagement и findings (ядро клиента)
- [x] **T-035** — Engagement: сущность + state machine жизненного цикла + выбор режима (формальный/облегчённый, ADR-0005). **+ вехи/milestones (плановая и фактическая дата) по стадиям и правила переходов между ними (ENG-03 RFP).** _Deps: T-032._ DoD: engagement проходит переходы статусов; вехи план/факт видны. **Готово: миграция 0011 — `audit_type` (lookup UNI-06, сид 6 глобальных под owner), `engagement` (FORCE RLS как subsidiary; mode formal/light, state §8, paused_from_state для resume, archived_at; opinion_id/plan_item_id придут со своими lookup/plan-задачами), `engagement_milestone` (план/факт, RLS через EXISTS). State machine в коде (engagement-states.ts): полный цикл draft→…→closed; formal — строго следующая стадия, light — скип разрешён только через согласовательные (manager_review/management_response/approval); paused из любого рабочего + resume ровно в paused_from_state; archived только из closed. Переход проставляет actual_date вехи (создаёт фактическую, если план не задавался). API под PermissionGuard (первый доменный CRUD с enforcement: Collaborator create→403): POST /engagements, POST /:id/transition, GET список/карточка (+allowedTransitions[] для UI-кнопок); всё в audit_log. UI: /engagements + /engagements/<id> — состояние, кнопки переходов (server actions), вехи план/факт; локализация состояний en/az/ru. E2e: formal-запрет скипа, light-скип, пауза/resume/архив, RBAC, факт вехи после перехода, кнопка в UI двигает состояние.**
- [x] **T-036** — Чеклист engagement'а: подбор контролей из библиотеки (ручной) в engagement. _Deps: T-035, T-031._ DoD: в engagement добавлены контроли-вопросы. **Готово: миграция 0012 — `checklist_item` (СНАПШОТ контроля по data-model §10.1: ref/domain_code/objective/question копируются, control_id только origin-ссылка; order, assigned_respondent_id и status — заделы под T-037; FORCE RLS через EXISTS к engagement). `POST /engagements/:id/checklist-items {controlIds}` — bulk-добавление под engagement.edit, уже включённые пропускаются (`{added:n}`), в audit_log engagement.checklist_updated с addedRefs; `checklist[]` в GET-карточке (локализованный). UI: секция «Чеклист» в /engagements/<id> — таблица пунктов + форма добавления чекбоксами (библиотека минус уже включённые, server action). E2e: добавление 3 контролей, идемпотентность, снапшот-тексты в БД, RBAC 403, добавление из UI-формы.**
- [x] **T-037** — Ответы респондентов: заполнение ответа на пункт чеклиста (2-я колонка клиента). _Deps: T-036._ DoD: респондент сохраняет ответ. **Готово: миграция 0013 — `response` (UNIQUE на пункт, respondent_membership_id, text, compliance_status, submitted_at; FORCE RLS через checklist_item→engagement). `complianceStatusSchema` в shared — фиксированные enum'ы чеклиста клиента (compliant/partially/non/not_applicable; конфигурируемые lookup'ы GEN-06 — EP-CONFIG). `PUT /engagements/:id/checklist-items/:itemId/response` — upsert (повторный PUT перезаписывает), пункт → status=answered, response.submitted в audit_log; право — engagement.view (респонденты = Collaborator'ы; ужесточение до назначенного respondent'а придёт с назначением респондентов на пункты). Ответ в `checklist[].response` карточки. UI: форма «Ответить на пункт» (select+textarea+select), ответ с автором под вопросом, compliance-бейдж вместо raw-статуса. E2e: Collaborator сохраняет/перезаписывает, 400 на мусорный статус, одна строка в БД, UI-форма работает. Evidence (документы к ответу) — придёт с T-034 (document_link).**
- [ ] **T-038** — Finding: severity(risk), owner с обеих сторон, deadline, resolution date, linked control, remediation, ссылка на стандарт. _Deps: T-037, T-043._ DoD: finding создаётся со всеми колонками клиента.
- [ ] **T-039** — Finding lifecycle: identified→owner→remediation→**re-test аудитором→закрытие** (владелец отмечает «исправлено», аудитор проверяет и закрывает — из диаграммы RFP); email owner'у при назначении; напоминания при приближении дедлайна (обеим сторонам). _Deps: T-038, T-041, T-040._ DoD: назначение шлёт письмо; за N дней до дедлайна уходит напоминание; закрыть без re-test нельзя (в формальном режиме).

### Эпик: Обзор и отчёты
- [ ] **T-044** — Дашборды: issues/findings по группе / по дочке / по департаменту. _Deps: T-038, T-012._ DoD: три уровня дашборда показывают агрегаты.
- [ ] **T-045** — Экспорт отчёта engagement'а: **PDF + Word + Excel (T-001) и CSV/XML (REP-07 RFP)**; списки (engagement'ы, findings) выгружаются в Excel (ENG-02). _Deps: T-038, T-042._ DoD: файл отчёта генерируется и скачивается во всех форматах.
- [x] **T-046** — Onboarding-checklist на тенант (мини-Roadmap). _Deps: T-035._ DoD: новый тенант видит шаги внедрения. **Готово: без таблицы — 6 шагов ВЫЧИСЛЯЮТСЯ из данных тенанта (как Vanta Roadmap; прогресс всегда честный, ручного стейта нет): invite_team (≥2 активных membership), create_subsidiary, adapt_control (тенантская адаптация), create_engagement, build_checklist, collect_responses. `GET /onboarding` (settings.view). UI: виджет на /account — прогресс-бар + список с галками, en/az/ru. E2e: demo 6/6, свежий пустой тенант 0/6 (все todo), Collaborator 403. Кастомные/ручные шаги — если понадобятся, отдельной задачей.**

---

## M2. Расширение до паритета (эпики — распишем на атомы, когда дойдём)

- **EP-INT** — Integrations-framework (B2): абстракция Connector с capability-scope; первые коннекторы (AD/Entra→персонал, облако→активы, тикеты→задачи).
- **EP-ASSET** — Asset/Process Universe (B3) + авто-обнаружение через коннекторы.
- **EP-IAM** — Access Review / IAM (B11): аккаунты, UAR, access requests, deprovisioning.
- **EP-POL** — Policies (B4): версии, approver-workflow, attestation.
- **EP-RISK** — Risk register + library + heat map + action tracker + risk-based planning с capacity (наша добавка). **+ risk-assessment события (сессии оценки) с документами (RSK-01), конфигурируемая методология/критерии/веса (RSK-02), risk-опросники с review/approval workflow (RSK-04).**
- **EP-PERS** — Профили персонала, endpoint compliance (B12), employee-портал.
- **EP-VULN** — Vulnerability + Change management + Security alerts (B13).
- **EP-VEND** — Vendor Risk Management (B5).
- **EP-REP** — Reports как настраиваемые чарт-дашборды (B9) + snapshots (B10).

## M3. Полный паритет (эпики)

- **EP-TRUST** — Trust Center (B7): публичный portal, access requests, activity log, knowledge base.
- **EP-PRIV** — Privacy/ROPA + DPIA (раздел C).
- **EP-QA** — Questionnaire Automation (AI отвечает на опросники, раздел C).
- **EP-FWK** — Широкая библиотека фреймворков до паритета с Vanta.
- **EP-MISC** — Commitments, Developer console/API, Tags, AI Memory.

## RFP-эпики (Cyberross, ADR-0017) — весь RFP в скоупе

Источник: [rfp-coverage.md](client-templates/rfp-coverage.md). Порядок внутри — от фундаментальных (влияют на ERD) к тяжёлым отделяемым модулям.

Влияют на модель данных — учесть в T-003, реализация фаза 2:
- **EP-AUDITTYPES** — все типы аудита (операционный/финансовый/IT/комплаенс/качество/расследования) как атрибут engagement/плана + типо-специфичные шаблоны (UNI-06).
- **EP-UNIVERSE** — Audit Universe: дерево auditable entities неограниченной глубины (locations/processes/systems/activities), permanent files на узел, связь с рисками/планом (UNI-01/02, RSK-06).
- **EP-CONFIG** — конфигурируемость: per-tenant терминология/названия полей/списков (GEN-06), неограниченные custom fields без кода (GEN-07), audit opinions из настраиваемых списков (ENG-09).
- **EP-WPAPERS** — электронные working papers: WP как контейнер fieldwork (WP-02), audit programs + roll-forward год→год (ENG-04/05), rich-редактор (WP-01), cross-reference/гиперссылки (WP-05), sign-off preparer≠reviewer с 'edited since review' (WP-07/08 — частично есть в audit trail).
- **EP-TIME** — тайм-трекинг: Time Entry по аудиту/фазе/программе + непродуктивное время, бюджет vs факт, ставки/расходы (TIME-01/03, UNI-07, SCH-07).

Отделяемые модули — фаза 2/3:
- **EP-SCHED** — scheduling: Gantt с drag-drop (SCH-01), аллокация ресурсов и утилизация (SCH-02/03), конфликты (SCH-04), пауза аудита (SCH-06).
- **EP-SEARCH** — глобальный поиск best-match по findings/WP/чеклистам/шаблонам (GEN-05) + полнотекстовый поиск внутри Office/PDF (DAT-04).
- **EP-REPWIZ** — report wizard + стандартные отчёты + сравнение по периодам + XML/CSV экспорт (REP-01/02/03/05/07).
- **EP-MSG** — сообщения из системы (GEN-04), опросники из audit file с консолидацией (ENG-07), satisfaction surveys (ISS-06).
- **EP-MIGRATE** — инструмент миграции исторических данных (≥4 лет) из Office-файлов: планы/отчёты/findings/действия/тайм-листы (IMP-03).
- **EP-API** — публичный документированный REST API + OpenAPI-спека (INT-01, Mandatory!). Принцип API-first с фазы 1 (наш UI ест свой же API), публичная документация — фаза 2. Поднято из EP-MISC, т.к. в RFP это M, а не «Developer console когда-нибудь».
- **EP-HELP** — встроенная помощь: подсказки, инструкции, глоссарий терминов в UI (GEN-09, D) + требование responsive/планшеты во всех UI-задачах (GEN-10, D).

Тяжёлые gap'ы — фаза 3+, осознанно приняты (ADR-0017):
- **EP-ANNOT** — аннотация документов (tick marks, комменты) в Office/PDF внутри приложения (WP-06) + exception reporting (WP-09).
- **EP-OFFLINE** — офлайн-режим working papers с синхронизацией без потери целостности (WP-10).
- **EP-HARDEN** — WORM-хранение админ-логов через S3 Object Lock (LOG-03), tamper-protection журнала — hash chain (LOG-01), field-level права (SEC-04), детект конкурентных сессий + lockout (SEC-07), гранулярный restore одного аудита (BCK-04), export/import конфигурации (TEC-04), **версионирование конфигурации с историей (TEC-03), syslog-экспорт security-логов с retention (LOG-06), архивирование/retention/move engagement'ов (ENG-08, BCK-06)**.
- **EP-LOWCODE** — конструктор процессов для непрограммиста (IMP-04) + KPI контролей (CTL-04) + trend/causal аналитика рисков (RSK-08).
- **EP-HA** — multi-node HA (active-active), node-by-node upgrade, uptime ≥99.7% (INF-02/03/04).

Бизнес-трек (не код — заявка/организация): VEN-критерии поставщика, 24/7 SLA (SUP), ISO27001/SOC2-постур (SEC-12), комплект документации (DOC-01..07), UAT-процесс. Держать в уме при ответе на RFP.

## Добавки поверх паритета (наши, строим параллельно — эпики)

- **EP-AI** — AI-генерация checklists и findings из бизнес-профиля + документов (ADR-0004).
- **EP-GROUP** — Групповая консолидация и кросс-дочерние роли (заложено в M0, углубляем).
- **EP-PLAN** — Risk-based audit planning с capacity (человеко-часы, число аудиторов, годовой план). **+ несколько планов на любые горизонты (UNI-03), recurring-аудиты с интервалом и внеплановые (UNI-05), live-прогресс против плана + дашборд ревизий плана (UNI-08).**
- **EP-ONPREM** — On-prem поставка (ADR-0002): один артефакт, offline-режим без AI. **+ бэкап-инструментарий в поставке (pgBackRest/WAL-PITR конфигурация, BCK-02/03), интеграция с центральной backup-системой клиента (BCK-05), hardened базовые образы (INF-07).**
- **EP-I18N** — Полная мультиязычность UI+контента EN/AZ/RU (заложено в T-022, доводим).
