# Runbook: Google Cloud Run deployment

Текущий pilot-контур проекта `it-audit-platform`:

- project: `it-audit-pilot-rr-260801`;
- region: `europe-west3`;
- services: `it-audit-api`, `it-audit-web`;
- migration job: `it-audit-migrate`;
- image repository: `it-audit-pilot` in Artifact Registry.

Hetzner Docker Compose больше не является целевым deploy-контуром этого проекта.

## Автоматическая выкатка

1. Изменения попадают в pull request.
2. Полный workflow `CI` собирает приложение, поднимает изолированные PostgreSQL,
   Redis, MinIO и Mailpit, выполняет миграции, lint, typecheck, тесты, Playwright
   smoke и сборку обоих Docker-образов.
3. После merge в `main` повторный успешный `CI` запускает workflow
   `Deploy (Cloud Run)`.
4. GitHub получает краткоживущие Google credentials через Workload Identity
   Federation. JSON-ключа service account в GitHub нет.
5. Оба образа получают неизменяемый тег полного Git SHA и отправляются в
   Artifact Registry.
6. Job `it-audit-migrate` обновляется тем же API-образом и выполняет миграции.
7. API и web выпускаются как новые Cloud Run revisions. API проходит
   аутентифицированный `/health`; web должен перейти в состояние Ready.

Cloud Run ограничен `max-instances=1`, `min-instances=0`, `concurrency=10`,
`1 CPU`, `512 MiB` отдельно для API и web. Эти лимиты являются защитой от
неожиданного масштабирования и затрат.

## Данные

Cloud Run containers не используются для постоянного хранения:

- PostgreSQL находится в Neon;
- Redis находится в Upstash;
- загруженные файлы находятся в Google Cloud Storage;
- Cloud Run revisions и images можно пересоздать из Git SHA.

Удаление или замена Cloud Run revision не удаляет PostgreSQL, Redis или GCS.

## Миграции

Откат трафика не откатывает схему базы. Поэтому миграции для автоматического
deploy обязаны быть backward-compatible:

1. сначала добавить новые таблицы/колонки без удаления старых;
2. выпустить код, совместимый со старой и новой схемой;
3. перенести/проверить данные;
4. удалять старую схему отдельным следующим релизом.

Разрушительную миграцию нельзя merge в `main`, пока отдельно не подготовлены
backup, проверка восстановления и ручной план отката.

## Проверка текущей ревизии

```bash
gcloud run services describe it-audit-api \
  --project it-audit-pilot-rr-260801 --region europe-west3 \
  --format='value(status.latestReadyRevisionName)'

gcloud run services describe it-audit-web \
  --project it-audit-pilot-rr-260801 --region europe-west3 \
  --format='value(status.latestReadyRevisionName)'
```

Workflow также записывает Git SHA и имена обеих готовых revisions в
`GITHUB_STEP_SUMMARY`.

## Откат приложения

При ошибке после создания новой revision workflow возвращает 100% трафика на
ранее сохранённые ready revisions. Ручной откат выполняется только на известные
готовые revisions:

```bash
gcloud run services update-traffic it-audit-api \
  --project it-audit-pilot-rr-260801 --region europe-west3 \
  --to-revisions API_PREVIOUS_REVISION=100

gcloud run services update-traffic it-audit-web \
  --project it-audit-pilot-rr-260801 --region europe-west3 \
  --to-revisions WEB_PREVIOUS_REVISION=100
```

После отката повторяются authenticated API health, вход через web и чтение
ранее сохранённой записи из PostgreSQL.

## Известный blocker

Password login работает. Magic-link email в pilot пока не production-ready:
SMTP указывает на локальный Mailpit (`127.0.0.1:1025`). До подключения реального
SMTP-провайдера нельзя обещать клиентам вход по magic link.
