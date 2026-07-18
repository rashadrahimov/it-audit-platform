CREATE TABLE "framework" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"name_i18n" jsonb NOT NULL,
	"version" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"source_framework_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "framework_requirement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"framework_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"title_i18n" jsonb NOT NULL,
	"text_i18n" jsonb,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "framework" ADD CONSTRAINT "framework_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework" ADD CONSTRAINT "framework_source_framework_id_framework_id_fk" FOREIGN KEY ("source_framework_id") REFERENCES "public"."framework"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_requirement" ADD CONSTRAINT "framework_requirement_framework_id_framework_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."framework"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_requirement" ADD CONSTRAINT "framework_requirement_parent_id_framework_requirement_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."framework_requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "framework_tenant_idx" ON "framework" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "framework_requirement_fw_ref_idx" ON "framework_requirement" USING btree ("framework_id","ref");--> statement-breakpoint
-- RLS по паттерну role (0003, ADR-0016; без FORCE: сид глобальной библиотеки идёт под владельцем audit).
-- framework: глобальные (tenant_id IS NULL) видны всем, тенантские — своему тенанту; писать app может только свои.
ALTER TABLE "framework" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "framework_read" ON "framework" FOR SELECT
  USING ("tenant_id" IS NULL OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "framework_write" ON "framework" FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
-- framework_requirement наследует видимость от родительского фреймворка
ALTER TABLE "framework_requirement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "framework_requirement_read" ON "framework_requirement" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "framework" f WHERE f."id" = "framework_id"
    AND (f."tenant_id" IS NULL OR f."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)));--> statement-breakpoint
CREATE POLICY "framework_requirement_write" ON "framework_requirement" FOR ALL
  USING (EXISTS (SELECT 1 FROM "framework" f WHERE f."id" = "framework_id"
    AND f."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "framework" f WHERE f."id" = "framework_id"
    AND f."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));