CREATE TABLE "trust_activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trust_center_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trust_access_request" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "trust_activity" ADD CONSTRAINT "trust_activity_trust_center_id_trust_center_id_fk" FOREIGN KEY ("trust_center_id") REFERENCES "public"."trust_center"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trust_activity_tc_idx" ON "trust_activity" USING btree ("trust_center_id");--> statement-breakpoint
ALTER TABLE "trust_activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trust_activity" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "trust_activity_isolation" ON "trust_activity"
  USING (EXISTS (SELECT 1 FROM "trust_center" tc WHERE tc."id" = "trust_center_id"
    AND tc."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "trust_center" tc WHERE tc."id" = "trust_center_id"
    AND tc."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
