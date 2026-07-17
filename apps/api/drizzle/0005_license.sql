CREATE TABLE "license" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan" text DEFAULT 'standard' NOT NULL,
	"max_subsidiaries" integer NOT NULL,
	"max_audit_seats" integer NOT NULL,
	"valid_until" timestamp with time zone,
	"terms" text DEFAULT 'subscription' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "license" ADD CONSTRAINT "license_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "license_tenant_idx" ON "license" USING btree ("tenant_id");--> statement-breakpoint
-- RLS как у subsidiary: доменная таблица тенанта (T-011)
ALTER TABLE "license" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "license" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "license"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
