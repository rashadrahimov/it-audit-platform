CREATE TABLE "trust_access_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trust_center_id" uuid NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trust_access_request" ADD CONSTRAINT "trust_access_request_trust_center_id_trust_center_id_fk" FOREIGN KEY ("trust_center_id") REFERENCES "public"."trust_center"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trust_access_request_tc_idx" ON "trust_access_request" USING btree ("trust_center_id");--> statement-breakpoint
ALTER TABLE "trust_access_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trust_access_request" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "trust_access_request_isolation" ON "trust_access_request"
  USING (EXISTS (SELECT 1 FROM "trust_center" tc WHERE tc."id" = "trust_center_id"
    AND tc."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "trust_center" tc WHERE tc."id" = "trust_center_id"
    AND tc."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
