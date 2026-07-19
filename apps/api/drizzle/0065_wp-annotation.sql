CREATE TABLE "wp_annotation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"working_paper_id" uuid NOT NULL,
	"kind" text DEFAULT 'comment' NOT NULL,
	"anchor" text,
	"body" text NOT NULL,
	"author_membership_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wp_annotation" ADD CONSTRAINT "wp_annotation_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_annotation" ADD CONSTRAINT "wp_annotation_working_paper_id_working_paper_id_fk" FOREIGN KEY ("working_paper_id") REFERENCES "public"."working_paper"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_annotation" ADD CONSTRAINT "wp_annotation_author_membership_id_membership_id_fk" FOREIGN KEY ("author_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wp_annotation_wp_idx" ON "wp_annotation" USING btree ("working_paper_id");--> statement-breakpoint
ALTER TABLE "wp_annotation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wp_annotation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "wp_annotation"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
