CREATE TABLE "audit_type_template_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"audit_type_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"objective_i18n" jsonb NOT NULL,
	"question_i18n" jsonb NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_type_template_item" ADD CONSTRAINT "audit_type_template_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_type_template_item" ADD CONSTRAINT "audit_type_template_item_audit_type_id_audit_type_id_fk" FOREIGN KEY ("audit_type_id") REFERENCES "public"."audit_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_type_template_item_tenant_idx" ON "audit_type_template_item" USING btree ("tenant_id","audit_type_id");--> statement-breakpoint
ALTER TABLE "audit_type_template_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_type_template_item" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit_type_template_item"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
