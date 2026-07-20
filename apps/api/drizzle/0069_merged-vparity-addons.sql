CREATE TABLE "audit_firm" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"note" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"counterparty" text,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"note" text,
	"owner_membership_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_acl" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"level" text DEFAULT 'view' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_review" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"status" text DEFAULT 'not_ready' NOT NULL,
	"note" text,
	"reviewed_by_membership_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "framework_activation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"framework_id" uuid NOT NULL,
	"target_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee_membership_id" uuid,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trust_center_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "category" SET DEFAULT 'internal';--> statement-breakpoint
ALTER TABLE "risk" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "code_change" ADD COLUMN "asset_id" uuid;--> statement-breakpoint
ALTER TABLE "commitment" ADD COLUMN "contract_id" uuid;--> statement-breakpoint
ALTER TABLE "connector" ADD COLUMN "sync_interval_minutes" integer;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "framework" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "framework" ADD COLUMN "previous_version_id" uuid;--> statement-breakpoint
ALTER TABLE "framework" ADD COLUMN "update_notes" text;--> statement-breakpoint
ALTER TABLE "kb_entry" ADD COLUMN "owner_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "kb_entry" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kb_entry" ADD COLUMN "trust_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "policy" ADD COLUMN "renewal_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "privacy_assessment" ADD COLUMN "approver_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "privacy_assessment" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "privacy_assessment" ADD COLUMN "review_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "data_locations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "review_owner_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD COLUMN "review_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "report_snapshot" ADD COLUMN "composition" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "risk" ADD COLUMN "approval_status" text;--> statement-breakpoint
ALTER TABLE "risk" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "security_alert" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "security_alert" ADD COLUMN "asset_id" uuid;--> statement-breakpoint
ALTER TABLE "security_alert" ADD COLUMN "due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "security_alert" ADD COLUMN "sla_status" text DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_ai_config" ADD COLUMN "memory" text;--> statement-breakpoint
ALTER TABLE "test" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "trust_access_request" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "vulnerability" ADD COLUMN "asset_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_firm" ADD CONSTRAINT "audit_firm_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_acl" ADD CONSTRAINT "entity_acl_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_acl" ADD CONSTRAINT "entity_acl_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_review" ADD CONSTRAINT "evidence_review_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_review" ADD CONSTRAINT "evidence_review_reviewed_by_membership_id_membership_id_fk" FOREIGN KEY ("reviewed_by_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_activation" ADD CONSTRAINT "framework_activation_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_activation" ADD CONSTRAINT "framework_activation_framework_id_framework_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."framework"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_membership_id_membership_id_fk" FOREIGN KEY ("assignee_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_activity" ADD CONSTRAINT "trust_activity_trust_center_id_trust_center_id_fk" FOREIGN KEY ("trust_center_id") REFERENCES "public"."trust_center"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_firm_tenant_idx" ON "audit_firm" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "contract_tenant_idx" ON "contract" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "entity_acl_entity_idx" ON "entity_acl" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_acl_triple_idx" ON "entity_acl" USING btree ("entity_type","entity_id","membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_review_entity_idx" ON "evidence_review" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "framework_activation_pair_idx" ON "framework_activation" USING btree ("tenant_id","framework_id");--> statement-breakpoint
CREATE INDEX "task_entity_idx" ON "task" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "trust_activity_tc_idx" ON "trust_activity" USING btree ("trust_center_id");--> statement-breakpoint
ALTER TABLE "code_change" ADD CONSTRAINT "code_change_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework" ADD CONSTRAINT "framework_previous_version_id_framework_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."framework"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entry" ADD CONSTRAINT "kb_entry_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_assessment" ADD CONSTRAINT "privacy_assessment_approver_membership_id_membership_id_fk" FOREIGN KEY ("approver_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activity" ADD CONSTRAINT "processing_activity_review_owner_membership_id_membership_id_fk" FOREIGN KEY ("review_owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_alert" ADD CONSTRAINT "security_alert_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vulnerability" ADD CONSTRAINT "vulnerability_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vulnerability_asset_idx" ON "vulnerability" USING btree ("asset_id");
--> statement-breakpoint
-- RLS-политики, извлечённые из миграций 0067-0089 (регенерация их не воспроизводит)

-- from 0068_framework-activation.sql
ALTER TABLE "framework_activation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "framework_activation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "framework_activation"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- from 0070_risk-library.sql
DROP POLICY "tenant_isolation" ON "risk";
--> statement-breakpoint
CREATE POLICY "risk_read" ON "risk" FOR SELECT
  USING ("tenant_id" IS NULL OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "risk_write" ON "risk" FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- from 0072_control-mapping-tenant-fw.sql
-- T-V46: тенант может маппить требования СВОЕЙ версии фреймворка на любой контрол
-- (в т.ч. глобальный) — иначе перенос маппингов на новую версию упирается в RLS.
DROP POLICY "control_mapping_write" ON "control_mapping";
--> statement-breakpoint
CREATE POLICY "control_mapping_write" ON "control_mapping" FOR ALL
  USING (
    EXISTS (SELECT 1 FROM "control" c WHERE c."id" = "control_id"
      AND c."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    OR EXISTS (SELECT 1 FROM "framework_requirement" fr
      JOIN "framework" f ON f."id" = fr."framework_id"
      WHERE fr."id" = "requirement_id"
      AND f."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "control" c WHERE c."id" = "control_id"
      AND c."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    OR EXISTS (SELECT 1 FROM "framework_requirement" fr
      JOIN "framework" f ON f."id" = fr."framework_id"
      WHERE fr."id" = "requirement_id"
      AND f."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  );
--> statement-breakpoint

-- from 0073_remediation-task.sql
ALTER TABLE "task" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "task"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- from 0074_audit-firm-evidence.sql
ALTER TABLE "audit_firm" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_firm" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit_firm"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "evidence_review" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "evidence_review" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "evidence_review"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- from 0079_trust-activity.sql
ALTER TABLE "trust_activity" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "trust_activity" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "trust_activity_isolation" ON "trust_activity"
  USING (EXISTS (SELECT 1 FROM "trust_center" tc WHERE tc."id" = "trust_center_id"
    AND tc."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "trust_center" tc WHERE tc."id" = "trust_center_id"
    AND tc."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
--> statement-breakpoint

-- from 0080_contracts.sql
ALTER TABLE "contract" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contract" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "contract"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- from 0086_entity-acl.sql
-- entity_acl: доменная таблица — изоляция по тенанту (FORCE, как остальные)
ALTER TABLE "entity_acl" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "entity_acl" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "entity_acl"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
