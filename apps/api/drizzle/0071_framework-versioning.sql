ALTER TABLE "framework" ADD COLUMN "previous_version_id" uuid;--> statement-breakpoint
ALTER TABLE "framework" ADD COLUMN "update_notes" text;--> statement-breakpoint
ALTER TABLE "framework" ADD CONSTRAINT "framework_previous_version_id_framework_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."framework"("id") ON DELETE no action ON UPDATE no action;