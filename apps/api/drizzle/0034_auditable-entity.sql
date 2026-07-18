CREATE TABLE "auditable_entity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" text NOT NULL,
	"ref_id" uuid,
	"name_i18n" jsonb NOT NULL,
	"description_i18n" jsonb,
	"owner_membership_id" uuid,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditable_entity" ADD CONSTRAINT "auditable_entity_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditable_entity" ADD CONSTRAINT "auditable_entity_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditable_entity_tenant_idx" ON "auditable_entity" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "auditable_entity_parent_idx" ON "auditable_entity" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "auditable_entity" ADD CONSTRAINT "auditable_entity_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."auditable_entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditable_entity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auditable_entity" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "auditable_entity"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
