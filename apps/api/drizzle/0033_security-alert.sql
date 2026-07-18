CREATE TABLE "security_alert" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source" text,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"triage_note" text,
	"connector_id" uuid,
	"triaged_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "security_alert" ADD CONSTRAINT "security_alert_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_alert" ADD CONSTRAINT "security_alert_connector_id_connector_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connector"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "security_alert_tenant_idx" ON "security_alert" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "security_alert" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "security_alert" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "security_alert"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
