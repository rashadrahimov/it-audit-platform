CREATE TABLE "control" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"origin_control_id" uuid,
	"ref" text NOT NULL,
	"domain_id" uuid NOT NULL,
	"objective_i18n" jsonb NOT NULL,
	"question_i18n" jsonb NOT NULL,
	"guidance_i18n" jsonb,
	"owner_membership_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "control_domain" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"code" text NOT NULL,
	"name_i18n" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "control_mapping" (
	"id" uuid PRIMARY KEY NOT NULL,
	"control_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control" ADD CONSTRAINT "control_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control" ADD CONSTRAINT "control_origin_control_id_control_id_fk" FOREIGN KEY ("origin_control_id") REFERENCES "public"."control"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control" ADD CONSTRAINT "control_domain_id_control_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."control_domain"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control" ADD CONSTRAINT "control_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_domain" ADD CONSTRAINT "control_domain_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_mapping" ADD CONSTRAINT "control_mapping_control_id_control_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."control"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_mapping" ADD CONSTRAINT "control_mapping_requirement_id_framework_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."framework_requirement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "control_tenant_ref_idx" ON "control" USING btree ("tenant_id","ref");--> statement-breakpoint
CREATE INDEX "control_domain_idx" ON "control" USING btree ("domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "control_domain_tenant_code_idx" ON "control_domain" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "control_mapping_pair_idx" ON "control_mapping" USING btree ("control_id","requirement_id");--> statement-breakpoint
-- RLS по паттерну framework/role (ADR-0016; без FORCE: сид глобальной библиотеки — под владельцем audit).
ALTER TABLE "control_domain" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "control_domain_read" ON "control_domain" FOR SELECT
  USING ("tenant_id" IS NULL OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "control_domain_write" ON "control_domain" FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "control" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "control_read" ON "control" FOR SELECT
  USING ("tenant_id" IS NULL OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "control_write" ON "control" FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
-- control_mapping наследует видимость от контроля
ALTER TABLE "control_mapping" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "control_mapping_read" ON "control_mapping" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "control" c WHERE c."id" = "control_id"
    AND (c."tenant_id" IS NULL OR c."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)));--> statement-breakpoint
CREATE POLICY "control_mapping_write" ON "control_mapping" FOR ALL
  USING (EXISTS (SELECT 1 FROM "control" c WHERE c."id" = "control_id"
    AND c."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "control" c WHERE c."id" = "control_id"
    AND c."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
