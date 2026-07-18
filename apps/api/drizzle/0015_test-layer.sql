CREATE TABLE "test" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	"title_i18n" jsonb NOT NULL,
	"kind" text DEFAULT 'manual' NOT NULL,
	"check_config" jsonb,
	"frequency" text,
	"owner_membership_id" uuid,
	"due_date" timestamp with time zone,
	"sla_status" text DEFAULT 'ok' NOT NULL,
	"status" text DEFAULT 'needs_attention' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_result" (
	"id" uuid PRIMARY KEY NOT NULL,
	"test_id" uuid NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL,
	"failing_entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_document_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test" ADD CONSTRAINT "test_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test" ADD CONSTRAINT "test_control_id_control_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."control"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test" ADD CONSTRAINT "test_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_result" ADD CONSTRAINT "test_result_test_id_test_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."test"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_result" ADD CONSTRAINT "test_result_evidence_document_id_document_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "test_tenant_idx" ON "test" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "test_control_idx" ON "test" USING btree ("control_id");--> statement-breakpoint
CREATE INDEX "test_result_test_idx" ON "test_result" USING btree ("test_id","run_at");--> statement-breakpoint
-- test: доменная таблица — изоляция по тенанту (FORCE, как subsidiary)
ALTER TABLE "test" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "test" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "test"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
-- результаты наследуют изоляцию от теста
ALTER TABLE "test_result" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "test_result" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "test_result_isolation" ON "test_result"
  USING (EXISTS (SELECT 1 FROM "test" t WHERE t."id" = "test_id"
    AND t."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "test" t WHERE t."id" = "test_id"
    AND t."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
