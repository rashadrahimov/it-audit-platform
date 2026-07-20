# ADR-0021: Per-tenant SSO-конфиг и маршрутизация логина по email-домену (home-realm discovery)

Статус: принято (2026-07-20)
Контекст: EP-AUTH-PARITY. Развивает ADR-0006 (auth: local + OIDC/SAML/LDAP).

## Контекст

SSO из T-016/T-024/T-025 (OIDC/SAML/LDAP) настраивается **глобально** через env —
один IdP на всё развёртывание. Для SaaS-паритета (Vanta/Okta) нужен **per-tenant
SSO**: у каждой организации свой IdP, и пользователь на общей странице входа должен
автоматически попадать на IdP своей организации по домену e-mail («home-realm
discovery», SP-initiated). Пример: сотрудник вводит `ivan@acme.com` → платформа
видит, что домен `acme.com` закреплён за тенантом Acme с OIDC-провайдером → уводит
на IdP Acme, а не показывает поле пароля.

## Решение

### 1. Таблица `sso_config` — над-тенантная, без RLS

Как `user`/`membership`/`auth_event` (ADR-0015): конфиг читается **на этапе логина,
до установления tenant-контекста**, поэтому RLS применить нельзя (под ролью `app`
без контекста политика вернула бы 0 строк). Изоляция тенантов обеспечивается **в
коде**: CRUD скоупится по `tenant_id` из `PermissionGuard`, а не политикой БД.

Поля: `tenant_id`, `email_domain` (UNIQUE, lower-case — домен принадлежит ровно
одному тенанту), `method` (`oidc|saml`), `provider_label` (отображаемое имя IdP),
`issuer_url`/`client_id`/`metadata_url` (параметры подключения IdP),
`secret_encrypted` (client secret OIDC — AES-256-GCM, переиспользуем
`config-crypto`, наружу НЕ отдаётся), `enabled`.

Секрет шифруется (утечка БД не даёт кредов IdP), домен уникален глобально
(маршрутизация детерминирована), связь с тенантом — FK.

### 2. Резолвер диспатча (чистая функция)

`resolveDispatch(email, config)` по домену e-mail возвращает решение:
`{ dispatch: 'sso', method, providerLabel, redirectPath }` либо
`{ dispatch: 'password' }` (нет конфига, выключен, или домен не покрыт). Чистая,
без БД — юнит-тестируема; нормализация домена (нижний регистр, часть после `@`)
рядом.

### 3. Публичный эндпоинт `POST /auth/sso/dispatch`

Без аутентификации (как `/auth/login`): по e-mail отдаёт решение. Наличие
SSO-домена не секрет; секреты IdP через API не выходят. Веб-страница
`/login/sso` — «рабочий e-mail → уводим на IdP организации или подсказываем
войти паролем».

### 4. CRUD `/sso-config` (settings.edit)

Админ тенанта заводит/меняет/удаляет домен-конфиги своей организации. Секрет
принимается на запись, шифруется, обратно не отдаётся (в ответе — `hasSecret`).
Скоуп по `tenant_id` из guard — админ Acme не видит конфиги Globex.

### 5. Аддитивность и связь с существующим OIDC/SAML

Диспатч **не ломает** парольный/MFA/magic-link вход: это отдельный публичный
резолвер + отдельная страница. `redirectPath` ведёт на существующие init-маршруты
(`/auth/oidc/login`, `/auth/saml/login`). Демонстрация — на живом Keycloak
(демо-тенант, домен `demo.io` → OIDC). **Дальнейший шаг:** сделать
init/callback-маршруты tenant-aware — строить OIDC/SAML-клиент из `sso_config`
по `email_domain`/`ssoConfigId` вместо глобального env (сейчас demo-домен указывает
на тот же Keycloak, что и env, поэтому вход завершается и без этой доработки).

## Последствия

- (+) Home-realm discovery по домену — ключевой SaaS-SSO-паттерн, паритет с Vanta.
- (+) Над-тенантная таблица без RLS консистентна с прецедентом (user/membership),
  причина задокументирована; изоляция — в CRUD-сервисе.
- (+) Секреты IdP шифрованы, наружу не отдаются.
- (−) Полный per-tenant OIDC/SAML (клиент из БД, а не env) — отдельный шаг;
  до него demo-домен работает через совпадающий с env Keycloak.
- Риск: критичный login-контур — все правки аддитивны, парольный путь не тронут,
  покрыты unit+integration+e2e.

## Статус реализации

- **T-H39** — таблица `sso_config`, резолвер, CRUD `/sso-config`, публичный
  `/auth/sso/dispatch`, веб `/login/sso` (home-realm discovery).
- **T-H40** — OIDC init+callback tenant-aware: клиент строится из `sso_config` по
  домену (`?domain=`/`?email=`), `ssoConfigId` едет в state, discovery кешируется;
  `?mode=web` завершает вход в веб-сессию (cookie `session` + redirect `/account`),
  `mode=api` (дефолт) сохраняет JSON-контракт T-016. Веб-кнопка «Continue with
  {provider}» через route `/login/sso/start` уводит на IdP; браузерный round-trip
  через Keycloak доведён до `/account` (e2e под гейтом `E2E_KEYCLOAK=1` — в CI
  Keycloak нет).
- **Остаток:** (1) per-tenant **SAML** (аналогично OIDC, из `metadata_url`);
  (2) прод с раздельными доменами api/web — cookie ставит API host-scoped на
  `localhost`, для прода нужен same-origin callback на веб-домене (пункт T-047).
