CREATE TABLE "audit_program" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_id" uuid,
	"origin_program_id" uuid,
	"subject_area" text,
	"title_i18n" jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_step" (
	"id" uuid PRIMARY KEY NOT NULL,
	"program_id" uuid NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"title_i18n" jsonb NOT NULL,
	"instructions_i18n" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_program" ADD CONSTRAINT "audit_program_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_program" ADD CONSTRAINT "audit_program_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_step" ADD CONSTRAINT "program_step_program_id_audit_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."audit_program"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_program_tenant_idx" ON "audit_program" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "program_step_program_idx" ON "program_step" USING btree ("program_id");--> statement-breakpoint
ALTER TABLE "audit_program" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_program" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit_program"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "program_step" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "program_step" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "program_step_isolation" ON "program_step"
  USING (EXISTS (SELECT 1 FROM "audit_program" p WHERE p."id" = "program_id"
    AND p."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "audit_program" p WHERE p."id" = "program_id"
    AND p."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
