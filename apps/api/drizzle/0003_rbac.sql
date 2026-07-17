CREATE TABLE "permission" (
	"id" uuid PRIMARY KEY NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"name_i18n" jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"level" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_resource_action_idx" ON "permission" USING btree ("resource","action");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permission_role_permission_idx" ON "role_permission" USING btree ("role_id","permission_id");--> statement-breakpoint
-- RLS (без FORCE: сид системных пресетов идёт под владельцем audit).
-- role: глобальные (tenant_id IS NULL) видны всем, тенантские — своему тенанту; писать app может только свои.
ALTER TABLE "role" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "role_read" ON "role" FOR SELECT
  USING ("tenant_id" IS NULL OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "role_write" ON "role" FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
-- role_permission наследует видимость от родительской роли
ALTER TABLE "role_permission" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "role_permission_read" ON "role_permission" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "role" r WHERE r."id" = "role_id"
    AND (r."tenant_id" IS NULL OR r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)));--> statement-breakpoint
CREATE POLICY "role_permission_write" ON "role_permission" FOR ALL
  USING (EXISTS (SELECT 1 FROM "role" r WHERE r."id" = "role_id"
    AND r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "role" r WHERE r."id" = "role_id"
    AND r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));