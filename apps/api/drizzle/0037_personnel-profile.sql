CREATE TABLE "personnel_profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid,
	"department_id" uuid,
	"external_id" text,
	"full_name" text NOT NULL,
	"email" text,
	"unit" text,
	"position" text,
	"employment_status" text DEFAULT 'active' NOT NULL,
	"hired_at" timestamp with time zone,
	"contacts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"certificates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"connector_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personnel_profile" ADD CONSTRAINT "personnel_profile_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel_profile" ADD CONSTRAINT "personnel_profile_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel_profile" ADD CONSTRAINT "personnel_profile_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel_profile" ADD CONSTRAINT "personnel_profile_connector_id_connector_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connector"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personnel_profile_tenant_idx" ON "personnel_profile" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personnel_profile_connector_external_idx" ON "personnel_profile" USING btree ("connector_id","external_id");--> statement-breakpoint
ALTER TABLE "personnel_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "personnel_profile" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "personnel_profile"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
