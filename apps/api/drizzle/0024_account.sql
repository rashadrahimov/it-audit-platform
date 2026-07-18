CREATE TABLE "account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subsidiary_id" uuid,
	"connector_id" uuid,
	"identifier" text NOT NULL,
	"display_name" text,
	"owner_membership_id" uuid,
	"groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"type" text DEFAULT 'human' NOT NULL,
	"mfa_enabled" boolean,
	"status" text DEFAULT 'active' NOT NULL,
	"created_in_source" timestamp with time zone,
	"deactivated_in_source" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_subsidiary_id_subsidiary_id_fk" FOREIGN KEY ("subsidiary_id") REFERENCES "public"."subsidiary"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_tenant_idx" ON "account" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_source_idx" ON "account" USING btree ("tenant_id","connector_id","identifier");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_connector_id_connector_id_fk"
  FOREIGN KEY ("connector_id") REFERENCES "connector"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "account"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
