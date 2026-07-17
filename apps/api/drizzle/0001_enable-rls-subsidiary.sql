-- RLS-изоляция тенантов (T-011, ADR-0003).
-- Приложение ходит под непривилегированной ролью app: суперпользователь audit
-- (владелец, дефолт postgres-образа) обходит RLS даже с FORCE. Миграции — под audit.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app LOGIN PASSWORD 'app';
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;--> statement-breakpoint
-- FORCE: политика действует и на владельца (защита, если DDL-сессия полезет в данные).
-- NULLIF(...,''): без контекста current_setting отдаёт NULL/'' — default deny без ошибки каста.
ALTER TABLE "subsidiary" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subsidiary" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "subsidiary"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
