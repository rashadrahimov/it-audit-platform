CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"actor_user_id" uuid,
	"actor_ip" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"prev_hash" text,
	"hash" text
);
--> statement-breakpoint
CREATE TABLE "auth_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"event" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_log_tenant_at_idx" ON "audit_log" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE INDEX "auth_event_user_at_idx" ON "auth_event" USING btree ("user_id","at");--> statement-breakpoint
-- Append-only: журнал нельзя править/чистить из приложения (LOG-01)
REVOKE UPDATE, DELETE ON "audit_log" FROM app;--> statement-breakpoint
REVOKE UPDATE, DELETE ON "auth_event" FROM app;--> statement-breakpoint
-- Чтение audit_log — только свои записи тенанта; вставка свободна (пишут и системные процессы)
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_log_read" ON "audit_log" FOR SELECT
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "audit_log_insert" ON "audit_log" FOR INSERT WITH CHECK (true);
