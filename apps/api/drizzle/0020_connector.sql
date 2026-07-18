CREATE TABLE "connector" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config_encrypted" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"connector_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text DEFAULT 'running' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connector" ADD CONSTRAINT "connector_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_connector_id_connector_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connector"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connector_tenant_idx" ON "connector" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "sync_run_connector_idx" ON "sync_run" USING btree ("connector_id","started_at");--> statement-breakpoint
-- connector: доменная таблица — изоляция по тенанту (FORCE, как subsidiary)
ALTER TABLE "connector" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "connector" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "connector"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
-- sync_run наследует изоляцию от коннектора
ALTER TABLE "sync_run" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_run" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sync_run_isolation" ON "sync_run"
  USING (EXISTS (SELECT 1 FROM "connector" c WHERE c."id" = "connector_id"
    AND c."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "connector" c WHERE c."id" = "connector_id"
    AND c."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
