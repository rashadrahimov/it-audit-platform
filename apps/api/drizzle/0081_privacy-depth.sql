ALTER TABLE "privacy_assessment" ADD COLUMN "approver_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "privacy_assessment" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "privacy_assessment" ADD COLUMN "review_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "data_locations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "review_owner_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "review_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "privacy_assessment" ADD CONSTRAINT "privacy_assessment_approver_membership_id_membership_id_fk" FOREIGN KEY ("approver_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_review_owner_membership_id_membership_id_fk" FOREIGN KEY ("review_owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;