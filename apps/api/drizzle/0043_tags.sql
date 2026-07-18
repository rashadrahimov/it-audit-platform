CREATE TABLE "tag" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tag_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_link" ADD CONSTRAINT "tag_link_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tag_tenant_idx" ON "tag" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_tenant_name_idx" ON "tag" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_link_triple_idx" ON "tag_link" USING btree ("tag_id","entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "tag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tag" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tag"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tag_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tag_link" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tag_link_isolation" ON "tag_link"
  USING (EXISTS (SELECT 1 FROM "tag" tg WHERE tg."id" = "tag_id"
    AND tg."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "tag" tg WHERE tg."id" = "tag_id"
    AND tg."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
