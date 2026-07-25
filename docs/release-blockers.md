# Release blockers register

Статус: T-H150. Этот файл отделяет реально оставшиеся buildable-задачи от пунктов, которые нельзя честно закрыть без решения клиента, production secrets, инфраструктуры, production data access или внешней проверки.

## Latest production verification

- **25.07.2026 деплой T-IR10 (Next 15.5.20 → 16.2.11).** SHA `4b5a98a5a`, выкачен `scripts/prod-deploy.sh` (образы под тегом SHA, контейнеры проверены по `Config.Image`). Схема БД не менялась (79 миграций). Веб-стек: Next 16.2.11, next-intl 4.13.4, глобальный перехватчик переименован в `apps/web/src/proxy.ts` (конвенция Next 16).
- **Проверено на проде браузером:** логин прод-админом, создание записи на `/security-alerts` — строка появилась **без reload** (регрессия T-IR09 не вернулась), `?locale=ru` через новый proxy отдаёт `<html lang="ru">`, дашборд рисуется, ошибок в консоли нет.
- **Скелетон навигации остаётся снятым:** на 16.2.11 регрессия vercel/next.js#87529 закрыта частично — списки чинятся, карточки динамических маршрутов (`/incidents/[id]`) после server action всё ещё не перерисовываются. Возврат `loading.tsx` вынесен в `[!] T-IR11` (ждёт апстрим).

- **25.07.2026 деплой EP-OPS + репетиция отката.** Итоговый выкаченный SHA — `6def91439` (в него вошёл фикс скриптов, см. ниже); репетиция отката проводилась на `7550e6e55`, выкачен новым `scripts/prod-deploy.sh` (образы тегированы SHA). Схема БД не менялась (79 миграций). **Откат отрепетирован на живом проде:** переключение на предыдущий образ `c4a257308` и возврат вперёд — по 17–19 с каждое, api/web 200 после каждого перехода. Что откатывается именно код, проверено побочным признаком: на старом образе `/docs-json` снова 200, после возврата — 404 (гейт T-OPS04).
- **Дефект собственных скриптов, пойманный проверкой:** после первой выкатки контейнеры поднялись на `:latest`, а `latest` указывал на свежепересобранный образ — «откат на предыдущий тег» увёл бы не туда. Причина: `IMAGE_TAG` как префикс команды не попадает в интерполяцию compose, а `up -d` без `--no-build` пересобирает образ. Исправлено (`export IMAGE_TAG` + `--no-build`), оба скрипта теперь сверяют `Config.Image` с ожидаемым тегом и падают при расхождении. На диске лежат 4 тега api/web для отката.
- Процедура целиком: [docs/deploy-rollback-runbook.md](deploy-rollback-runbook.md). Быстрый откат: `bash scripts/prod-rollback.sh <sha> [сколько-миграций-назад]`.
- **Изменение поверхности прода:** `/docs` и `/docs-json` больше не отдаются анонимно (`NODE_ENV=production` → выключено, включается `SWAGGER_ENABLED=true`). Требование RFP INT-01 (API-first) выполняется спекой в dev/CI и по явному флагу.

- **25.07.2026 деплой T-IR09 (фикс обновления списков после server action).** SHA `9e7c8563e`. Схема БД не менялась (миграций по-прежнему 79), выкатка чисто фронтовая: пересборка образов → `run --rm migrate` (no-op) → `up -d api web`. Бэкап перед выкаткой: `~/prod-backup-2026-07-25-pre-ir09.dump` (539 KB).
- **Проверено на проде реальным браузером, включая путь ЗАПИСИ** (закрывает пробел предыдущего деплоя): вход прод-админом → создание инцидента на `/incidents` → редирект на карточку без reload → переход фазы (таймлайн обновился без reload) → закрытие инцидента. Тестовый инцидент «T-IR09 smoke …» остался на проде в статусе closed — единственная запись, созданная проверкой.
- Причина бага была не в приложении: регрессия React Fiber, вшитая в Next 15.4.2–15.5.x (vercel/next.js#87529). Триггером служила единственная глобальная Suspense-граница `apps/web/src/app/loading.tsx`; она удалена (T-IR09), скелетон навигации вернём после апгрейда Next ≥16.2.6 (T-IR10). Регрессионный тест — `apps/web/e2e/action-refresh.spec.ts`.

- **25.07.2026 ручной деплой EP-INC (incident management) на production.** Причина ручного пути: GitHub Actions не стартует с 19.07 (биллинг-блок аккаунта), поэтому автоматический deploy workflow недоступен. Развёрнутый SHA: `497606d6f`. Порядок: pg_dump прод-базы (`~/prod-backup-2026-07-25-pre-incidents.dump`, 525 KB) → `docker compose -f docker-compose.prod.yml build migrate bootstrap api web` → `run --rm migrate` (миграции 75 → **79**, применены 0075–0078) → `up -d api web` (bootstrap идемпотентно отработал).
- Проверено после деплоя (read-only, 5 независимых срезов): API `:8090` health 200, 11 маршрутов инцидентов в `/docs-json`; веб `:8080` — `/incidents`, `/dashboard`, `/security-alerts`, `/account` отдают 200 на локалях ru/en/az с 0 `MISSING_MESSAGE`; `incident`/`incident_event`/`incident_link` с `FORCE ROW LEVEL SECURITY` и политикой `tenant_isolation`, гранты роли `app` на месте; данные не пострадали (tenant 2, user 9, membership 5, control 78, finding 12, audit_log 906 — как до миграции); регрессия старых разделов чистая, в логах api/web 0 ошибок за окно деплоя.
- **Не проверено на проде:** путь записи инцидентов — 8 из 11 маршрутов (`POST /incidents`, `/transition`, `/assign`, `/events`, `/links`, `/follow-up`, `/notify`, `/postmortem`, `PATCH /incidents/:id`) на проде ни разу не исполнялись: проверка была намеренно read-only, чтобы не заводить записи в production data. Полный цикл доказан на dev (e2e в реальном браузере + 22 интеграционных теста). Также: прод-админ состоит только в тенанте `main`, весь бизнес-контент — в `demo`, поэтому списки с реальными строками на проде не покрыты.
- **Откат на 25.07.2026 не быстрый** (см. задачи T-OPS01–T-OPS04 в backlog): образов предыдущей версии нет (`docker images` — только `:latest`, собранные сегодня; dangling пусто), поэтому откат кода = пересборка из `cbe13550d`; дамп снят без `--clean`/`--create` и в непустую базу без подготовки не встанет; down-файлы 0073/0074 отсутствуют (цепочка вниз рвётся сразу под EP-INC); процедура отката нигде не записана.

- 23.07.2026 автоматический production workflow успешно развернул `main` на `78.47.51.200`, проверенный SHA: `f103ca5`.
- Production worktree синхронизирован с Git: ветка `main`, чистый status.
- `api`, `web`, `postgres`, `redis`, `minio` запущены; API health и страницы `/`, `/dashboards`, `/engagements`, `/config` возвращают HTTP 200.
- 22.07.2026 выполнена контролируемая очистка build cache, остановленных контейнеров, неиспользуемых образов и пользовательских Gradle/npm caches. Свободное место выросло примерно с 12 GiB до 24 GiB; после повторных production-сборок доступно около 20 GiB (87% занято). Активные контейнеры, volumes, Android SDK, репозитории и Codex worktrees сохранены.

## Client decisions required

1. **Регулятор / местный стандарт.**
   - Нужен выбор применимого локального стандарта и требуемых формулировок. CBAR seed уже присутствует как общий framework, но production baseline должен подтвердить клиент.

2. **Excel-шаблоны клиента.**
   - Нужны реальные исторические планы/time sheets/findings templates для migration mapping и UAT импорта.

3. **Оплата/биллинг.**
   - Нужно бизнес-решение: perpetual vs subscription, включённые seats/subsidiaries, лимиты и commercial terms.

4. **Решение по AI.**
   - Нужен выбор режима: cloud provider, локальная модель или AI off для on-prem. Без этого нельзя включать генеративные checklists/findings как production feature.

5. **UAT на реальных данных.**
   - Нужны данные клиента, пользователи, сценарии приёмки и окно обучения.

## Production deployment

1. GitHub Actions secrets `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_PATH` и `DEPLOY_USER` настроены 22.07.2026.
2. Deploy workflow передаёт проверенный Git bundle на сервер, поэтому production-хосту не нужны GitHub credentials. Выкладка `main` запускается только после успешного полного CI и завершается API/web smoke-проверкой.
3. Предыдущие failed deploy runs относятся к периоду до настройки secrets и не описывают текущее состояние.

## Production data / integrity blockers

1. **Live demo/prod audit-log chain reports `needsReview`.**
   - Evidence from site check on `http://78.47.51.200:8080/audit-log`: `reason=content-hash`, `brokenAt=019f76a3-ed8d-7239-b422-2e6d36d3273f`.
   - Code-side LOG-01 behavior is correct: `audit-hash-chain.spec.ts` proves a tampered row is detected instead of hidden.
   - Resolution needs production DB/backup authority, not a normal code patch. Follow [`docs/audit-log-integrity-runbook.md`](audit-log-integrity-runbook.md): preserve evidence, compare with backup/WAL/PITR, then restore/reseed demo or open a documented new trust epoch.

## Infrastructure blockers

1. **EP-ONPREM.**
   - Needs client backup integration, offline artifact distribution, base image hardening requirements, pgBackRest/WAL-PITR target and operational ownership.

2. **EP-HA.**
   - Needs target topology, load balancer, Postgres HA design, upgrade policy and uptime SLO confirmation.

3. **EP-HARDEN infra.**
   - Needs WORM/S3 Object Lock backend, syslog destination, retention policy and SOC/security ownership.

4. **Production operations completion.**
   - Deploy pipeline и prod compose находятся в repo. Остаются клиентские решения по monitoring/alerting target, backup/PITR ownership и rotation policy.

## Architecture phase-3 forks

1. **EP-OFFLINE.**
   - Requires offline-first data model, conflict resolution, sync protocol and UX decisions.

2. **EP-ANNOT.**
   - Requires Office/PDF annotation engine choice, storage model for tick marks and viewer/editor UX.

3. **EP-LOWCODE.**
   - Requires process DSL/modeling approach, permissions model and governance of no-code changes.

## External QA / release gates

1. **Load testing.**
   - Needs agreed tenant/data scale, environment, target SLAs and non-production load window.

2. **Security audit.**
   - Needs external pentest/SCA/OWASP review scope and acceptance criteria.

3. **WCAG AA certification.**
   - Repo-side fixes can continue, but final release claim needs full a11y audit evidence.
