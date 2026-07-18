CREATE TABLE "access_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requester_membership_id" uuid NOT NULL,
	"system" text NOT NULL,
	"justification" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"approver_membership_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deprovisioning_task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"reason" text,
	"due_date" timestamp with time zone,
	"sla_status" text DEFAULT 'ok' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_request" ADD CONSTRAINT "access_request_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_request" ADD CONSTRAINT "access_request_requester_membership_id_membership_id_fk" FOREIGN KEY ("requester_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_request" ADD CONSTRAINT "access_request_approver_membership_id_membership_id_fk" FOREIGN KEY ("approver_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deprovisioning_task" ADD CONSTRAINT "deprovisioning_task_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deprovisioning_task" ADD CONSTRAINT "deprovisioning_task_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_request_tenant_idx" ON "access_request" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "deprovisioning_task_tenant_idx" ON "deprovisioning_task" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "access_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "access_request" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "access_request"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "deprovisioning_task" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deprovisioning_task" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "deprovisioning_task"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
