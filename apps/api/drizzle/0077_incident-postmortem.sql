ALTER TABLE "incident" ADD COLUMN "root_cause" text;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "impact_summary" text;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "lessons_learned" text;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "postmortem_at" timestamp with time zone;