CREATE TABLE "risk_control" (
	"id" uuid PRIMARY KEY NOT NULL,
	"risk_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "risk_control" ADD CONSTRAINT "risk_control_risk_id_risk_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_control" ADD CONSTRAINT "risk_control_control_id_control_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."control"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "risk_control_pair_idx" ON "risk_control" USING btree ("risk_id","control_id");--> statement-breakpoint
ALTER TABLE "risk_control" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "risk_control" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "risk_control_isolation" ON "risk_control"
  USING (EXISTS (SELECT 1 FROM "risk" r WHERE r."id" = "risk_id"
    AND r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "risk" r WHERE r."id" = "risk_id"
    AND r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
