CREATE TABLE "sign_off" (
	"id" uuid PRIMARY KEY NOT NULL,
	"working_paper_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role" text NOT NULL,
	"note" text,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "working_paper" (
	"id" uuid PRIMARY KEY NOT NULL,
	"engagement_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"preparer_membership_id" uuid,
	"reviewer_membership_id" uuid,
	"edited_since_review" boolean DEFAULT false NOT NULL,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sign_off" ADD CONSTRAINT "sign_off_working_paper_id_working_paper_id_fk" FOREIGN KEY ("working_paper_id") REFERENCES "public"."working_paper"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_off" ADD CONSTRAINT "sign_off_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_paper" ADD CONSTRAINT "working_paper_engagement_id_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_paper" ADD CONSTRAINT "working_paper_preparer_membership_id_membership_id_fk" FOREIGN KEY ("preparer_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_paper" ADD CONSTRAINT "working_paper_reviewer_membership_id_membership_id_fk" FOREIGN KEY ("reviewer_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sign_off_wp_idx" ON "sign_off" USING btree ("working_paper_id");--> statement-breakpoint
CREATE INDEX "working_paper_engagement_idx" ON "working_paper" USING btree ("engagement_id");--> statement-breakpoint
ALTER TABLE "working_paper" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "working_paper" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "working_paper_isolation" ON "working_paper"
  USING (EXISTS (SELECT 1 FROM "engagement" e WHERE e."id" = "engagement_id"
    AND e."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "engagement" e WHERE e."id" = "engagement_id"
    AND e."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));--> statement-breakpoint
ALTER TABLE "sign_off" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sign_off" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sign_off_isolation" ON "sign_off"
  USING (EXISTS (SELECT 1 FROM "working_paper" w JOIN "engagement" e ON e."id" = w."engagement_id"
    WHERE w."id" = "working_paper_id" AND e."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "working_paper" w JOIN "engagement" e ON e."id" = w."engagement_id"
    WHERE w."id" = "working_paper_id" AND e."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
