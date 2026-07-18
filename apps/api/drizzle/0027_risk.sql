CREATE TABLE "risk" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subsidiary_id" uuid,
	"domain" text,
	"title_i18n" jsonb NOT NULL,
	"description_i18n" jsonb,
	"category" text,
	"inherent_impact" integer,
	"inherent_likelihood" integer,
	"residual_impact" integer,
	"residual_likelihood" integer,
	"risk_class" text,
	"residual_class" text,
	"treatment" text,
	"owner_membership_id" uuid,
	"approver_membership_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"source_risk_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_matrix_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"impact_scale" integer DEFAULT 5 NOT NULL,
	"likelihood_scale" integer DEFAULT 5 NOT NULL,
	"thresholds" jsonb NOT NULL,
	"weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_subsidiary_id_subsidiary_id_fk" FOREIGN KEY ("subsidiary_id") REFERENCES "public"."subsidiary"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_approver_membership_id_membership_id_fk" FOREIGN KEY ("approver_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_source_risk_id_risk_id_fk" FOREIGN KEY ("source_risk_id") REFERENCES "public"."risk"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_matrix_config" ADD CONSTRAINT "risk_matrix_config_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "risk_tenant_idx" ON "risk" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_matrix_config_tenant_idx" ON "risk_matrix_config" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "risk_matrix_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "risk_matrix_config" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "risk_matrix_config"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "risk" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "risk" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "risk"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
