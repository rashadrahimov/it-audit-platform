# ADR-0023: Диспетчеризация логина на IdP тенанта по email-домену (T-V49-dispatch)

## Контекст

V49 дал per-tenant SSO-конфиг (`tenant.settings.sso`: protocol/emailDomain/entryPoint/clientId/секрет). Но фактический OIDC/SAML-флоу (`OidcService`/`SamlService`) — **глобальный**: конфиг берётся из env (один Keycloak-realm), `authorizationUrl()`/`handleCallback()` не знают про тенант. Vanta-паритет требует: пользователь вводит email → если домен принадлежит тенанту с включённым SSO, вход идёт через **его** IdP, а не пароль.

## Решение (целевой дизайн)

Диспетчеризация состоит из двух частей:

1. **Discovery (этот срез, buildable):** `POST /auth/sso/discover {email}` — публичный. По домену email ищет тенант с `sso.enabled=true` и совпадающим `emailDomain`; возвращает `{available, protocol?, tenantSlug?}`. Веб-логин по нему показывает «Continue with SSO» вместо пароля. Read-only, поверх V49-конфига, не трогает OAuth.

2. **Per-tenant IdP flow (отложено, [!] — внешний OAuth-контур):**
   - `GET /auth/oidc/login?tenant=<slug>` — если задан tenant, `OidcService` строит `oidc.Configuration` из **его** sso-config (issuer=entryPoint, clientId, расшифрованный секрет), НЕ из env; конфиг кешируется **per-tenant** (не единый `this.configuration`).
   - `state` (подписанный JWT) несёт `tenantSlug` → callback читает его и берёт тот же per-tenant конфиг для обмена кода.
   - Существующий глобальный `/auth/oidc/login` без `?tenant` сохраняется (обратная совместимость) — dispatch аддитивен.
   - SAML — по тому же принципу (`SamlService` per-tenant metadata/entryPoint).

## Почему часть 2 отложена как [!]

Правка внешнего OAuth/SAML-callback — самая необратимая auth-поверхность: ошибка ломает вход. Требует: per-tenant кеш конфигурации, безопасный перенос tenant через state с валидацией, round-trip-проверку с Keycloak, настроенным под конкретный тенант (dev-realm сейчас глобальный). Это дедицированная аккуратная работа отдельной сессией, а не хвост длинного марафона. Discovery (часть 1) не зависит от неё и поставляется сейчас.

## Безопасность

- Discovery раскрывает лишь факт «домен использует SSO» — приемлемо (стандартный IdP-discovery паттерн), tenant-slug возвращается только для маршрутизации.
- state обязан подписываться (CSRF) и в части 2 — валидироваться против реально настроенного тенанта (нельзя доверять tenantSlug из callback без сверки с sso-config).
