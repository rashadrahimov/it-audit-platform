CREATE TABLE "policy" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title_i18n" jsonb NOT NULL,
	"owner_membership_id" uuid,
	"approver_membership_id" uuid,
	"renew_by" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"framework_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"policy_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"document_id" uuid,
	"changelog" text,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_approver_membership_id_membership_id_fk" FOREIGN KEY ("approver_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_version" ADD CONSTRAINT "policy_version_policy_id_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_version" ADD CONSTRAINT "policy_version_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_version" ADD CONSTRAINT "policy_version_approved_by_membership_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_tenant_idx" ON "policy" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_version_idx" ON "policy_version" USING btree ("policy_id","version");--> statement-breakpoint
ALTER TABLE "policy" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "policy" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "policy"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "policy_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "policy_version" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "policy_version_isolation" ON "policy_version"
  USING (EXISTS (SELECT 1 FROM "policy" p WHERE p."id" = "policy_id"
    AND p."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "policy" p WHERE p."id" = "policy_id"
    AND p."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
