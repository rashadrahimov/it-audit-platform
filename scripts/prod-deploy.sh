#!/usr/bin/env bash
# T-OPS01: выкатка прода с тегированием образов по SHA коммита.
# Откат после этого — смена тега (scripts/prod-rollback.sh), а не пересборка.
#
#   bash scripts/prod-deploy.sh            # выкатить текущий HEAD
#   bash scripts/prod-deploy.sh <sha>      # выкатить конкретный коммит (образы должны быть собраны)
#
# Что делает: бэкап БД → сборка образов под тегом <sha> (+ latest) → миграции → api/web.
# НЕ путать со scripts/prod-deploy-with-data.sh — тот заливает дамп dev-базы поверх прода.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)
SHA="${1:-$(git rev-parse --short=9 HEAD)}"
STAMP="$(date +%Y-%m-%d-%H%M)"
BACKUP="$HOME/prod-backup-${STAMP}-pre-${SHA}.dump"

echo "▶ Выкатка ${SHA}"

echo "1/5  Бэкап продовой базы → ${BACKUP}"
docker exec it-audit-prod-postgres-1 pg_dump -U audit -d audit -Fc -f /tmp/prod-pre-deploy.dump
docker cp it-audit-prod-postgres-1:/tmp/prod-pre-deploy.dump "$BACKUP"
ls -lh "$BACKUP"

echo "2/5  Запоминаю текущий выкаченный тег (для отката)"
PREV="$(docker inspect it-audit-prod-api-1 --format '{{.Config.Image}}' 2>/dev/null | awk -F: '{print $2}' || echo latest)"
echo "$PREV" > .prod-previous-tag
echo "    предыдущий тег: ${PREV} (записан в .prod-previous-tag)"

echo "3/5  Сборка образов под тегом ${SHA}"
IMAGE_TAG="$SHA" "${COMPOSE[@]}" build migrate bootstrap api web
# latest всегда указывает на последнюю выкатку — чтобы `up -d` без IMAGE_TAG поднимал её же
for svc in migrate bootstrap api web; do
  docker tag "it-audit-prod-${svc}:${SHA}" "it-audit-prod-${svc}:latest"
done

echo "4/5  Миграции"
IMAGE_TAG="$SHA" "${COMPOSE[@]}" run --rm migrate

echo "5/5  Перезапуск api + web на теге ${SHA}"
IMAGE_TAG="$SHA" "${COMPOSE[@]}" up -d api web

sleep 12
echo "▶ Проверка"
curl -fsS -o /dev/null -w "   api  %{http_code}\n" "http://localhost:$(grep -E '^API_PORT=' .env.prod | cut -d= -f2)/health"
curl -fsS -o /dev/null -w "   web  %{http_code}\n" "http://localhost:$(grep -E '^WEB_PORT=' .env.prod | cut -d= -f2)/"
echo "▶ Готово: ${SHA} (откат: bash scripts/prod-rollback.sh)"
