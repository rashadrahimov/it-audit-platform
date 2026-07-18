CREATE TABLE "vendor" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subsidiary_id" uuid,
	"name" text NOT NULL,
	"category" text,
	"url" text,
	"inherent_risk" text,
	"residual_risk" text,
	"security_owner_membership_id" uuid,
	"status" text DEFAULT 'procurement' NOT NULL,
	"intake" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_assessment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"type" text,
	"state" text DEFAULT 'requested' NOT NULL,
	"due_date" timestamp with time zone,
	"owner_membership_id" uuid,
	"recommendation" text,
	"evidence_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_subsidiary_id_subsidiary_id_fk" FOREIGN KEY ("subsidiary_id") REFERENCES "public"."subsidiary"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_security_owner_membership_id_membership_id_fk" FOREIGN KEY ("security_owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_assessment" ADD CONSTRAINT "vendor_assessment_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_assessment" ADD CONSTRAINT "vendor_assessment_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendor_tenant_idx" ON "vendor" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "vendor_assessment_vendor_idx" ON "vendor_assessment" USING btree ("vendor_id");--> statement-breakpoint
ALTER TABLE "vendor" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vendor" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "vendor"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "vendor_assessment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vendor_assessment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "vendor_assessment_isolation" ON "vendor_assessment"
  USING (EXISTS (SELECT 1 FROM "vendor" v WHERE v."id" = "vendor_id"
    AND v."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "vendor" v WHERE v."id" = "vendor_id"
    AND v."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
