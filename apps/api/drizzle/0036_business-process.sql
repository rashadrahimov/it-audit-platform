CREATE TABLE "business_process" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subsidiary_id" uuid,
	"name_i18n" jsonb NOT NULL,
	"criticality" text DEFAULT 'medium' NOT NULL,
	"owner_membership_id" uuid,
	"scoring" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_process" ADD CONSTRAINT "business_process_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_process" ADD CONSTRAINT "business_process_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_process_tenant_idx" ON "business_process" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "business_process" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "business_process" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "business_process"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
