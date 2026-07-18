CREATE TABLE "finding" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_id" uuid,
	"checklist_item_id" uuid,
	"response_id" uuid,
	"control_id" uuid,
	"title_i18n" jsonb NOT NULL,
	"description_i18n" jsonb,
	"risk_rating" text NOT NULL,
	"recommendation_i18n" jsonb,
	"owner_membership_id" uuid,
	"auditor_membership_id" uuid,
	"due_date" timestamp with time zone,
	"sla_status" text DEFAULT 'ok' NOT NULL,
	"status" text DEFAULT 'identified' NOT NULL,
	"remediated_at" timestamp with time zone,
	"retest_result" text,
	"retested_by" uuid,
	"resolution_date" timestamp with time zone,
	"management_response" text,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_checklist_item_id_checklist_item_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."checklist_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_response_id_response_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."response"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_control_id_control_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."control"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_auditor_membership_id_membership_id_fk" FOREIGN KEY ("auditor_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_retested_by_membership_id_fk" FOREIGN KEY ("retested_by") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finding_tenant_idx" ON "finding" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "finding_engagement_idx" ON "finding" USING btree ("engagement_id");--> statement-breakpoint
-- finding: доменная таблица — изоляция по тенанту (FORCE, как subsidiary)
ALTER TABLE "finding" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "finding" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "finding"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
