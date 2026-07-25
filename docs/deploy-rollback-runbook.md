# Runbook: выкатка и откат production

T-OPS02 (эпик EP-OPS). Пишется по факту: каждая команда ниже выполнена на живом проде 25.07.2026.

Прод живёт на этом же хосте (`78.47.51.200`) в compose-проекте `it-audit-prod`: `postgres`, `redis`, `minio`, `api` (`:8090`), `web` (`:8080`). GitHub Actions с 19.07.2026 не стартует (биллинг-блок), поэтому выкатка ручная.

---

## 1. Выкатка

```bash
bash scripts/prod-deploy.sh          # текущий HEAD
bash scripts/prod-deploy.sh <sha>    # конкретный коммит
```

Скрипт делает по шагам: бэкап продовой базы в `~/prod-backup-<время>-pre-<sha>.dump` → запоминает текущий тег в `.prod-previous-tag` → собирает образы под тегом `<sha>` и двигает `latest` → прогоняет миграции (`run --rm migrate`) → поднимает `api` и `web` на теге `<sha>` → бьёт health обоих портов.

Ключевое отличие от прежнего ручного порядка: **образы тегируются SHA коммита**, поэтому предыдущая версия остаётся на диске и откат не требует пересборки.

> ⚠️ `scripts/prod-deploy-with-data.sh` — **не** для выкатки кода: он заливает дамп dev-базы поверх прода (`pg_restore --clean`) и затрёт продовые данные. Использовать только при первичном разворачивании.

## 2. Откат

```bash
bash scripts/prod-rollback.sh              # на тег из .prod-previous-tag
bash scripts/prod-rollback.sh <sha>        # на конкретный собранный тег
bash scripts/prod-rollback.sh <sha> 2      # + откатить 2 миграции ПЕРЕД сменой кода
```

**Порядок принципиален: сначала база, потом код.** Down-миграции гоняются **текущим (новым)** образом — в старом образе нет ни файлов `apps/api/drizzle/down/*`, ни записей о новых миграциях в `meta/_journal.json`. Скрипт исполняет их так:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  run --rm --entrypoint sh api -c "cd apps/api && node dist/db/migrate-down.js"
```

Именно внутри контейнера: там задан `DATABASE_URL_OWNER`. Снаружи `env.ts` молча подставит дев-базу `localhost:5433` и откатит не то. Раннер печатает цель отката (`host:port/база`) перед работой — сверяйте строку `postgres:5432/audit`.

Один вызов = одна миграция. Откатывать ровно столько, сколько миграций принёс выкаченный релиз (список — в `docs/release-blockers.md`, раздел «Latest production verification»).

## 3. Проверка после отката

```bash
curl -s -o /dev/null -w "api %{http_code}\n" http://localhost:8090/health
curl -s -o /dev/null -w "web %{http_code}\n" http://localhost:8080/
docker exec it-audit-prod-postgres-1 psql -U audit -d audit -c \
  "select count(*) from drizzle.__drizzle_migrations;"
docker inspect it-audit-prod-api-1 --format '{{.Config.Image}}'   # ожидаемый тег
```

Плюс глазами: вход прод-админом, любой список (например `/security-alerts`), создание записи — строка обязана появиться без ручного reload (регрессия T-IR09).

## 4. Если откатывать нечего (образа нет)

```bash
docker images | grep it-audit-prod        # какие теги есть
git log --oneline -15                     # выбрать целевой коммит
git checkout <sha> && bash scripts/prod-deploy.sh <sha> && git checkout main
```

Это уже пересборка — минуты простоя. Ради этого и введено тегирование: держите на диске хотя бы предыдущий релиз.

## 5. Восстановление базы из дампа (крайний случай)

Дампы сняты **без** `--create`/`--clean`, в непустую базу «как есть» не встанут. Порядок:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod stop api web
docker exec -i it-audit-prod-postgres-1 psql -U audit -d postgres -c \
  "DROP DATABASE audit WITH (FORCE); CREATE DATABASE audit OWNER audit;"
docker cp ~/prod-backup-<время>.dump it-audit-prod-postgres-1:/tmp/restore.dump
docker exec it-audit-prod-postgres-1 psql -U audit -d audit -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='app') THEN CREATE ROLE app LOGIN PASSWORD 'app'; END IF; END \$\$;"
docker exec it-audit-prod-postgres-1 pg_restore -U audit -d audit --no-owner /tmp/restore.dump
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api web
```

Данные вернутся на момент дампа — всё, что было после, потеряется. Поэтому дамп снимается **перед каждой** выкаткой автоматически.

## 6. Проверенная репетиция

25.07.2026 на живом проде выполнен полный цикл: выкатка `<новый sha>` → `scripts/prod-rollback.sh <предыдущий sha>` → проверка (api/web 200, тег в `docker inspect` = предыдущий) → возврат вперёд. Результат и тайминги — в `docs/release-blockers.md`.

## 7. Чего этот runbook не покрывает

- Откат через несколько релизов сразу: цепочка down-миграций проверена от 0079 до 0073 (T-OPS03), глубже — не проверялась.
- Восстановление на другой хост (DR): образов в реестре нет, только локальный docker; перенос = сборка на целевой машине.
- Автоматический откат по метрикам: мониторинга нет, решение принимает человек.
