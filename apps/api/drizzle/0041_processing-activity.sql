CREATE TABLE "processing_activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name_i18n" jsonb NOT NULL,
	"purpose" text,
	"legal_basis" text NOT NULL,
	"role" text DEFAULT 'controller' NOT NULL,
	"data_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_subjects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retention_period" text,
	"cross_border" boolean DEFAULT false NOT NULL,
	"owner_membership_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processing_activity_tenant_idx" ON "processing_activity" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "processing_activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "processing_activity" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "processing_activity"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
