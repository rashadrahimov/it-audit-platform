CREATE TABLE "glossary_term" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"term" text NOT NULL,
	"definition_i18n" jsonb NOT NULL,
	"category" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "glossary_term" ADD CONSTRAINT "glossary_term_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "glossary_term_tenant_term_idx" ON "glossary_term" USING btree ("tenant_id","term");--> statement-breakpoint
ALTER TABLE "glossary_term" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "glossary_term" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "glossary_read" ON "glossary_term" FOR SELECT
  USING ("tenant_id" IS NULL OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "glossary_write" ON "glossary_term" FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
