CREATE TABLE "trust_center" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"intro" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_center_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trust_center_id" uuid NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trust_center" ADD CONSTRAINT "trust_center_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_center_item" ADD CONSTRAINT "trust_center_item_trust_center_id_trust_center_id_fk" FOREIGN KEY ("trust_center_id") REFERENCES "public"."trust_center"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trust_center_slug_idx" ON "trust_center" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "trust_center_tenant_idx" ON "trust_center" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "trust_center_item_tc_idx" ON "trust_center_item" USING btree ("trust_center_id");--> statement-breakpoint
ALTER TABLE "trust_center" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trust_center" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "trust_center"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "trust_center_public_read" ON "trust_center" FOR SELECT
  USING ("is_public" = true AND "deleted_at" IS NULL);--> statement-breakpoint
ALTER TABLE "trust_center_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trust_center_item" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "trust_center_item_isolation" ON "trust_center_item"
  USING (EXISTS (SELECT 1 FROM "trust_center" tc WHERE tc."id" = "trust_center_id"
    AND tc."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "trust_center" tc WHERE tc."id" = "trust_center_id"
    AND tc."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
