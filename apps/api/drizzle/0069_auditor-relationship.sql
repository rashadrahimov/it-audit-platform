CREATE TABLE "auditor_assessment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"assessor_membership_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"note" text,
	"round" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"requested_by_membership_id" uuid NOT NULL,
	"assignee_membership_id" uuid,
	"document_id" uuid,
	"status" text DEFAULT 'requested' NOT NULL,
	"due_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_link" ADD COLUMN "review_status" text DEFAULT 'not_ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "data_access_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "data_access_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auditor_assessment" ADD CONSTRAINT "auditor_assessment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditor_assessment" ADD CONSTRAINT "auditor_assessment_assessor_membership_id_membership_id_fk" FOREIGN KEY ("assessor_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_requested_by_membership_id_membership_id_fk" FOREIGN KEY ("requested_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_assignee_membership_id_membership_id_fk" FOREIGN KEY ("assignee_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditor_assessment_target_idx" ON "auditor_assessment" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "evidence_request_engagement_idx" ON "evidence_request" USING btree ("engagement_id");--> statement-breakpoint
ALTER TABLE "auditor_assessment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auditor_assessment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "auditor_assessment"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "evidence_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_request" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "evidence_request"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);