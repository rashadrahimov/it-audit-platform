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
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_requested_by_membership_id_membership_id_fk" FOREIGN KEY ("requested_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_assignee_membership_id_membership_id_fk" FOREIGN KEY ("assignee_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_request" ADD CONSTRAINT "evidence_request_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_request_engagement_idx" ON "evidence_request" USING btree ("engagement_id");--> statement-breakpoint
ALTER TABLE "evidence_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_request" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "evidence_request"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);