CREATE TABLE "framework_activation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"framework_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "framework" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "framework_activation" ADD CONSTRAINT "framework_activation_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_activation" ADD CONSTRAINT "framework_activation_framework_id_framework_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."framework"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "framework_activation_pair_idx" ON "framework_activation" USING btree ("tenant_id","framework_id");--> statement-breakpoint
ALTER TABLE "framework_activation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "framework_activation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "framework_activation"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
