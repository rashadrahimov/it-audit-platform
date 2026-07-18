CREATE TABLE "control_kpi" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" text,
	"target_value" numeric(12, 2),
	"current_value" numeric(12, 2),
	"direction" text DEFAULT 'higher_better' NOT NULL,
	"period" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control_kpi" ADD CONSTRAINT "control_kpi_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_kpi" ADD CONSTRAINT "control_kpi_control_id_control_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."control"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "control_kpi_control_idx" ON "control_kpi" USING btree ("control_id");--> statement-breakpoint
ALTER TABLE "control_kpi" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "control_kpi" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "control_kpi"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
