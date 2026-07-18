CREATE TABLE "commitment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source" text,
	"description" text,
	"due_date" timestamp with time zone,
	"review_cadence" text,
	"owner_membership_id" uuid,
	"status" text DEFAULT 'met' NOT NULL,
	"sla_status" text DEFAULT 'ok' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commitment_tenant_idx" ON "commitment" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "commitment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "commitment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "commitment"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
