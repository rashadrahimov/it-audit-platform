CREATE TABLE "sso_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email_domain" text NOT NULL,
	"method" text NOT NULL,
	"provider_label" text NOT NULL,
	"issuer_url" text,
	"client_id" text,
	"secret_encrypted" text,
	"metadata_url" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sso_config_email_domain_unique" UNIQUE("email_domain")
);
--> statement-breakpoint
ALTER TABLE "sso_config" ADD CONSTRAINT "sso_config_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sso_config_tenant_idx" ON "sso_config" USING btree ("tenant_id");