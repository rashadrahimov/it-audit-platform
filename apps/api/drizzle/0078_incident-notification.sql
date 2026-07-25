ALTER TABLE "incident" ADD COLUMN "reportable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "regulator" text;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "notify_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "notification_note" text;