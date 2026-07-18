CREATE TABLE "asset" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subsidiary_id" uuid,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"owner_membership_id" uuid,
	"connector_id" uuid,
	"external_id" text,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_entity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"risk_id" uuid NOT NULL,
	"auditable_entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_connector_id_connector_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connector"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_entity" ADD CONSTRAINT "risk_entity_risk_id_risk_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_entity" ADD CONSTRAINT "risk_entity_auditable_entity_id_auditable_entity_id_fk" FOREIGN KEY ("auditable_entity_id") REFERENCES "public"."auditable_entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_tenant_idx" ON "asset" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_connector_external_idx" ON "asset" USING btree ("connector_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_entity_pair_idx" ON "risk_entity" USING btree ("risk_id","auditable_entity_id");--> statement-breakpoint
ALTER TABLE "asset" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "asset" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "asset"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "risk_entity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "risk_entity" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "risk_entity_isolation" ON "risk_entity"
  USING (EXISTS (SELECT 1 FROM "risk" r WHERE r."id" = "risk_id"
    AND r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "risk" r WHERE r."id" = "risk_id"
    AND r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
