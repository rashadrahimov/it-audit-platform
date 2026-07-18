CREATE TABLE "policy_attestation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"attested_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policy_attestation" ADD CONSTRAINT "policy_attestation_policy_version_id_policy_version_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_attestation" ADD CONSTRAINT "policy_attestation_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "policy_attestation_idx" ON "policy_attestation" USING btree ("policy_version_id","membership_id");--> statement-breakpoint
-- attestation наследует изоляцию от версии→политики (FORCE)
ALTER TABLE "policy_attestation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "policy_attestation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "policy_attestation_isolation" ON "policy_attestation"
  USING (EXISTS (SELECT 1 FROM "policy_version" pv JOIN "policy" p ON p."id" = pv."policy_id"
    WHERE pv."id" = "policy_version_id"
    AND p."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "policy_version" pv JOIN "policy" p ON p."id" = pv."policy_id"
    WHERE pv."id" = "policy_version_id"
    AND p."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
