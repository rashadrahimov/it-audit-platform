CREATE TABLE "document" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"prev_version_id" uuid,
	"owner_membership_id" uuid NOT NULL,
	"renew_by" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"relation" text DEFAULT 'evidence' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_prev_version_id_document_id_fk" FOREIGN KEY ("prev_version_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_link" ADD CONSTRAINT "document_link_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_tenant_idx" ON "document" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_link_triple_idx" ON "document_link" USING btree ("document_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "document_link_entity_idx" ON "document_link" USING btree ("entity_type","entity_id");--> statement-breakpoint
-- document: доменная таблица — изоляция по тенанту (FORCE, как subsidiary)
ALTER TABLE "document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "document"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
-- привязки наследуют изоляцию от документа
ALTER TABLE "document_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_link" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "document_link_isolation" ON "document_link"
  USING (EXISTS (SELECT 1 FROM "document" d WHERE d."id" = "document_id"
    AND d."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "document" d WHERE d."id" = "document_id"
    AND d."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
