CREATE TABLE "device" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_personnel_id" uuid,
	"name" text NOT NULL,
	"os" text,
	"serial" text,
	"disk_encryption" boolean DEFAULT false NOT NULL,
	"screen_lock" boolean DEFAULT false NOT NULL,
	"antivirus" boolean DEFAULT false NOT NULL,
	"password_policy" boolean DEFAULT false NOT NULL,
	"compliance_status" text DEFAULT 'non_compliant' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"connector_id" uuid,
	"external_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_owner_personnel_id_personnel_profile_id_fk" FOREIGN KEY ("owner_personnel_id") REFERENCES "public"."personnel_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_connector_id_connector_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connector"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_tenant_idx" ON "device" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_connector_external_idx" ON "device" USING btree ("connector_id","external_id");--> statement-breakpoint
ALTER TABLE "device" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "device" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "device"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
