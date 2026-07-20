CREATE TABLE "entity_acl" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"level" text DEFAULT 'view' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_acl" ADD CONSTRAINT "entity_acl_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_acl" ADD CONSTRAINT "entity_acl_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_acl_entity_idx" ON "entity_acl" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_acl_triple_idx" ON "entity_acl" USING btree ("entity_type","entity_id","membership_id");--> statement-breakpoint
-- entity_acl: доменная таблица — изоляция по тенанту (FORCE, как остальные)
ALTER TABLE "entity_acl" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entity_acl" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "entity_acl"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
