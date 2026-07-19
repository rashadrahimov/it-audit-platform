CREATE TABLE "field_permission" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"field" text NOT NULL,
	"level" text DEFAULT 'view' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "field_permission" ADD CONSTRAINT "field_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "field_permission_role_entity_field_idx" ON "field_permission" USING btree ("role_id","entity_type","field");--> statement-breakpoint
ALTER TABLE "field_permission" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "field_permission_read" ON "field_permission" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "role" r WHERE r."id" = "role_id"
    AND (r."tenant_id" IS NULL OR r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)));--> statement-breakpoint
CREATE POLICY "field_permission_write" ON "field_permission" FOR ALL
  USING (EXISTS (SELECT 1 FROM "role" r WHERE r."id" = "role_id"
    AND r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "role" r WHERE r."id" = "role_id"
    AND r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
