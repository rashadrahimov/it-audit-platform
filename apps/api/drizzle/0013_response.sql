CREATE TABLE "response" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checklist_item_id" uuid NOT NULL,
	"respondent_membership_id" uuid NOT NULL,
	"text" text NOT NULL,
	"compliance_status" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "response" ADD CONSTRAINT "response_checklist_item_id_checklist_item_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."checklist_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response" ADD CONSTRAINT "response_respondent_membership_id_membership_id_fk" FOREIGN KEY ("respondent_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "response_checklist_item_idx" ON "response" USING btree ("checklist_item_id");--> statement-breakpoint
-- ответ наследует изоляцию от пункта чеклиста → engagement (FORCE)
ALTER TABLE "response" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "response" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "response_isolation" ON "response"
  USING (EXISTS (SELECT 1 FROM "checklist_item" ci JOIN "engagement" e ON e."id" = ci."engagement_id"
    WHERE ci."id" = "checklist_item_id"
    AND e."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "checklist_item" ci JOIN "engagement" e ON e."id" = ci."engagement_id"
    WHERE ci."id" = "checklist_item_id"
    AND e."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
