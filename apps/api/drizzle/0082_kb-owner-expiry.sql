ALTER TABLE "kb_entry" ADD COLUMN "owner_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "kb_entry" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kb_entry" ADD CONSTRAINT "kb_entry_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;