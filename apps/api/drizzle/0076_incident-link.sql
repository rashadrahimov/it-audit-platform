CREATE TABLE "incident_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident_link" ADD CONSTRAINT "incident_link_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_link" ADD CONSTRAINT "incident_link_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incident_link_tenant_idx" ON "incident_link" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "incident_link_incident_idx" ON "incident_link" USING btree ("incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_link_uq" ON "incident_link" USING btree ("incident_id","entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "incident_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "incident_link" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "incident_link"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);