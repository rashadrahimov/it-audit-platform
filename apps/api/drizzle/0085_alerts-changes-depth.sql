ALTER TABLE "code_change" ADD COLUMN "asset_id" uuid;--> statement-breakpoint
ALTER TABLE "security_alert" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "security_alert" ADD COLUMN "asset_id" uuid;--> statement-breakpoint
ALTER TABLE "security_alert" ADD COLUMN "due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "security_alert" ADD COLUMN "sla_status" text DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "code_change" ADD CONSTRAINT "code_change_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_alert" ADD CONSTRAINT "security_alert_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;