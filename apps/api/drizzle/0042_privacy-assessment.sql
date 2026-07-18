CREATE TABLE "privacy_assessment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"processing_activity_id" uuid NOT NULL,
	"title" text NOT NULL,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"necessity_note" text,
	"mitigations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "privacy_assessment" ADD CONSTRAINT "privacy_assessment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_assessment" ADD CONSTRAINT "privacy_assessment_processing_activity_id_processing_activity_id_fk" FOREIGN KEY ("processing_activity_id") REFERENCES "public"."processing_activity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_assessment_tenant_idx" ON "privacy_assessment" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "privacy_assessment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "privacy_assessment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "privacy_assessment"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
