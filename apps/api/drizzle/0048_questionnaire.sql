CREATE TABLE "questionnaire" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questionnaire_answer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"questionnaire_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"kb_entry_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questionnaire" ADD CONSTRAINT "questionnaire_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_answer" ADD CONSTRAINT "questionnaire_answer_questionnaire_id_questionnaire_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaire"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_answer" ADD CONSTRAINT "questionnaire_answer_kb_entry_id_kb_entry_id_fk" FOREIGN KEY ("kb_entry_id") REFERENCES "public"."kb_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questionnaire_tenant_idx" ON "questionnaire" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "questionnaire_answer_q_idx" ON "questionnaire_answer" USING btree ("questionnaire_id");--> statement-breakpoint
ALTER TABLE "questionnaire" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "questionnaire" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "questionnaire"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "questionnaire_answer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "questionnaire_answer" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "questionnaire_answer_isolation" ON "questionnaire_answer"
  USING (EXISTS (SELECT 1 FROM "questionnaire" q WHERE q."id" = "questionnaire_id"
    AND q."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "questionnaire" q WHERE q."id" = "questionnaire_id"
    AND q."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
