#!/usr/bin/env bash
# T-OPS01/T-OPS02: откат прода на предыдущий образ — без пересборки, секунды простоя.
#
#   bash scripts/prod-rollback.sh              # на тег из .prod-previous-tag
#   bash scripts/prod-rollback.sh <sha>        # на конкретный собранный тег
#   bash scripts/prod-rollback.sh <sha> 2      # + откатить 2 миграции ПЕРЕД сменой кода
#
# ВАЖНО про порядок: down-миграции гоняются ТЕКУЩИМ (новым) образом — в старом образе
# нет ни файлов drizzle/down/*, ни записей журнала для новых миграций. Сначала БД, потом код.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)
TARGET="${1:-$(cat .prod-previous-tag 2>/dev/null || echo '')}"
STEPS="${2:-0}"

[ -n "$TARGET" ] || { echo "Не задан тег отката и нет .prod-previous-tag"; exit 1; }
docker image inspect "it-audit-prod-api:${TARGET}" >/dev/null 2>&1 || {
  echo "Образа it-audit-prod-api:${TARGET} нет локально."
  echo "Доступные теги:"; docker images --format '  {{.Repository}}:{{.Tag}}' | grep it-audit-prod || true
  exit 1
}

echo "▶ Откат на ${TARGET} (миграций назад: ${STEPS})"

if [ "$STEPS" -gt 0 ]; then
  echo "1/3  Бэкап перед откатом миграций"
  docker exec it-audit-prod-postgres-1 pg_dump -U audit -d audit -Fc -f /tmp/prod-pre-rollback.dump
  docker cp it-audit-prod-postgres-1:/tmp/prod-pre-rollback.dump "$HOME/prod-backup-$(date +%Y-%m-%d-%H%M)-pre-rollback.dump"

  echo "2/3  Откат ${STEPS} миграций ТЕКУЩИМ образом (в нём есть drizzle/down/*)"
  for _ in $(seq 1 "$STEPS"); do
    "${COMPOSE[@]}" run --rm --entrypoint sh api -c "cd apps/api && node dist/db/migrate-down.js"
  done
fi

echo "3/3  Переключаю api + web на образ ${TARGET}"
IMAGE_TAG="$TARGET" "${COMPOSE[@]}" up -d --no-build api web

sleep 12
curl -fsS -o /dev/null -w "   api  %{http_code}\n" "http://localhost:$(grep -E '^API_PORT=' .env.prod | cut -d= -f2)/health"
curl -fsS -o /dev/null -w "   web  %{http_code}\n" "http://localhost:$(grep -E '^WEB_PORT=' .env.prod | cut -d= -f2)/"
echo "▶ Откат выполнен: ${TARGET}"
