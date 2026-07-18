CREATE TABLE "audit_type" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"code" text NOT NULL,
	"name_i18n" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subsidiary_id" uuid NOT NULL,
	"audit_type_id" uuid,
	"title_i18n" jsonb NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"mode" text DEFAULT 'formal' NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"paused_from_state" text,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_milestone" (
	"id" uuid PRIMARY KEY NOT NULL,
	"engagement_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"planned_date" timestamp with time zone,
	"actual_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_type" ADD CONSTRAINT "audit_type_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_subsidiary_id_subsidiary_id_fk" FOREIGN KEY ("subsidiary_id") REFERENCES "public"."subsidiary"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_audit_type_id_audit_type_id_fk" FOREIGN KEY ("audit_type_id") REFERENCES "public"."audit_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_milestone" ADD CONSTRAINT "engagement_milestone_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_type_tenant_code_idx" ON "audit_type" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "engagement_tenant_idx" ON "engagement" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_milestone_stage_idx" ON "engagement_milestone" USING btree ("engagement_id","stage");--> statement-breakpoint
-- audit_type: reference-паттерн framework/role (глобальные читаемы всеми; без FORCE — сид под owner)
ALTER TABLE "audit_type" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_type_read" ON "audit_type" FOR SELECT
  USING ("tenant_id" IS NULL OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "audit_type_write" ON "audit_type" FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
-- engagement: доменная таблица — изоляция по тенанту (T-011), FORCE как subsidiary
ALTER TABLE "engagement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "engagement" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "engagement"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
-- вехи наследуют изоляцию от engagement
ALTER TABLE "engagement_milestone" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "engagement_milestone" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "engagement_milestone_isolation" ON "engagement_milestone"
  USING (EXISTS (SELECT 1 FROM "engagement" e WHERE e."id" = "engagement_id"
    AND e."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "engagement" e WHERE e."id" = "engagement_id"
    AND e."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
