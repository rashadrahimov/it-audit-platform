CREATE TABLE "annual_plan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"year" integer,
	"capacity_hours" numeric(10, 2),
	"status" text DEFAULT 'draft' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"auditable_entity_id" uuid,
	"priority_score" numeric(6, 2) DEFAULT '0' NOT NULL,
	"score_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"planned_hours" numeric(8, 2),
	"planned_quarter" text,
	"recurrence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "annual_plan" ADD CONSTRAINT "annual_plan_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_item" ADD CONSTRAINT "plan_item_plan_id_annual_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."annual_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_item" ADD CONSTRAINT "plan_item_auditable_entity_id_auditable_entity_id_fk" FOREIGN KEY ("auditable_entity_id") REFERENCES "public"."auditable_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annual_plan_tenant_idx" ON "annual_plan" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "plan_item_plan_idx" ON "plan_item" USING btree ("plan_id");--> statement-breakpoint
ALTER TABLE "annual_plan" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "annual_plan" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "annual_plan"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "plan_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_item" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "plan_item_isolation" ON "plan_item"
  USING (EXISTS (SELECT 1 FROM "annual_plan" p WHERE p."id" = "plan_id"
    AND p."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "annual_plan" p WHERE p."id" = "plan_id"
    AND p."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
