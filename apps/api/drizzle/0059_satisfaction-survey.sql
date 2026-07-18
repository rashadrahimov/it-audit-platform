CREATE TABLE "satisfaction_survey" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"respondent_membership_id" uuid,
	"rating" integer NOT NULL,
	"comment" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "satisfaction_survey" ADD CONSTRAINT "satisfaction_survey_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "satisfaction_survey" ADD CONSTRAINT "satisfaction_survey_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "satisfaction_survey" ADD CONSTRAINT "satisfaction_survey_respondent_membership_id_membership_id_fk" FOREIGN KEY ("respondent_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "satisfaction_survey_engagement_idx" ON "satisfaction_survey" USING btree ("engagement_id");--> statement-breakpoint
ALTER TABLE "satisfaction_survey" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "satisfaction_survey" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "satisfaction_survey"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
