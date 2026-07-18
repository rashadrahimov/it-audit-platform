CREATE TABLE "code_change" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" text,
	"risk" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"requester_membership_id" uuid,
	"approver_membership_id" uuid,
	"approved_at" timestamp with time zone,
	"deployed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_change" ADD CONSTRAINT "code_change_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_change" ADD CONSTRAINT "code_change_requester_membership_id_membership_id_fk" FOREIGN KEY ("requester_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_change" ADD CONSTRAINT "code_change_approver_membership_id_membership_id_fk" FOREIGN KEY ("approver_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_change_tenant_idx" ON "code_change" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "code_change" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "code_change" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "code_change"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
