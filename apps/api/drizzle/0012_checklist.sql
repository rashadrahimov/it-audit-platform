CREATE TABLE "checklist_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"engagement_id" uuid NOT NULL,
	"control_id" uuid,
	"ref" text NOT NULL,
	"domain_code" text,
	"objective_i18n" jsonb NOT NULL,
	"question_i18n" jsonb NOT NULL,
	"order" integer NOT NULL,
	"assigned_respondent_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_control_id_control_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."control"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_assigned_respondent_id_membership_id_fk" FOREIGN KEY ("assigned_respondent_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_item_engagement_idx" ON "checklist_item" USING btree ("engagement_id","order");--> statement-breakpoint
-- пункты чеклиста наследуют изоляцию от engagement (FORCE, как milestone)
ALTER TABLE "checklist_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checklist_item" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "checklist_item_isolation" ON "checklist_item"
  USING (EXISTS (SELECT 1 FROM "engagement" e WHERE e."id" = "engagement_id"
    AND e."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "engagement" e WHERE e."id" = "engagement_id"
    AND e."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
