CREATE TABLE "access_review" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"period" text,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"due_date" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_review_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"review_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"reviewer_membership_id" uuid,
	"decision" text,
	"decided_at" timestamp with time zone,
	"finding_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_review" ADD CONSTRAINT "access_review_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_review_item" ADD CONSTRAINT "access_review_item_review_id_access_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."access_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_review_item" ADD CONSTRAINT "access_review_item_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_review_item" ADD CONSTRAINT "access_review_item_reviewer_membership_id_membership_id_fk" FOREIGN KEY ("reviewer_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_review_tenant_idx" ON "access_review" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_review_item_idx" ON "access_review_item" USING btree ("review_id","account_id");--> statement-breakpoint
ALTER TABLE "access_review" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "access_review" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "access_review"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "access_review_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "access_review_item" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "access_review_item_isolation" ON "access_review_item"
  USING (EXISTS (SELECT 1 FROM "access_review" r WHERE r."id" = "review_id"
    AND r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "access_review" r WHERE r."id" = "review_id"
    AND r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
