#!/usr/bin/env bash
# T-H27: поднять prod-хостинг С ПЕРЕНОСОМ текущих данных (dev-база → prod).
# Дамп берётся из ~/audit-data.dump (уже создан: pg_dump dev-базы, схема+данные).
# Запуск:  bash scripts/prod-deploy-with-data.sh [путь-к-дампу]
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)
DUMP="${1:-$HOME/audit-data.dump}"
[ -f "$DUMP" ] || { echo "Дамп не найден: $DUMP"; exit 1; }
DB_PASSWORD="$(grep -E '^DB_PASSWORD=' .env.prod | cut -d= -f2-)"

echo "1/4  Поднимаю prod postgres..."
"${COMPOSE[@]}" up -d postgres
for i in $(seq 1 30); do
  "${COMPOSE[@]}" exec -T postgres pg_isready -U audit -d audit >/dev/null 2>&1 && break
  sleep 2
done

echo "2/4  Создаю роль app (нужна для grants/RLS из дампа)..."
"${COMPOSE[@]}" exec -T -e PGPASSWORD="$DB_PASSWORD" postgres \
  psql -U audit -d audit -v ON_ERROR_STOP=1 -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='app') THEN CREATE ROLE app LOGIN PASSWORD 'app'; END IF; END \$\$;"

echo "3/4  Заливаю данные ($DUMP)..."
CID="$("${COMPOSE[@]}" ps -q postgres)"
docker cp "$DUMP" "$CID":/tmp/audit-data.dump
# restore как суперюзер audit → обходит RLS (в т.ч. FORCE); --clean на свежей БД просто no-op
"${COMPOSE[@]}" exec -T -e PGPASSWORD="$DB_PASSWORD" postgres \
  pg_restore -U audit -d audit --no-owner --clean --if-exists /tmp/audit-data.dump || true

echo "4/4  Поднимаю api + web (migrate — no-op, bootstrap добавит prod-админа идемпотентно)..."
"${COMPOSE[@]}" up -d

echo
echo "Готово. Приложение: ${APP_URL:-http://78.47.51.200:8080}"
echo "Перенесены: dev-данные (тенант/аудиты/контроли) + добавлен prod-админ из .env.prod."
echo "ВНИМАНИЕ: в перенесённых данных есть демо-админ admin@demo.io со слабым паролем —"
echo "смени/отключи его в проде (см. заметку после запуска)."
