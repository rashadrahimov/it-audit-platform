-- Откат консолидированной миграции 0069 (весь EP-VPARITY + Добавки поверх main-0068).
-- Порядок: восстановить базовые политики risk/control_mapping → снять колонки → снести новые таблицы.

-- 1) risk: вернуть базовую tenant_isolation (0027), снять risk_read/risk_write (0070)
DROP POLICY IF EXISTS "risk_read" ON "risk";
DROP POLICY IF EXISTS "risk_write" ON "risk";
CREATE POLICY "tenant_isolation" ON "risk"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- 2) control_mapping: вернуть базовую политику (0010), снять расширенную (0072)
DROP POLICY IF EXISTS "control_mapping_write" ON "control_mapping";
CREATE POLICY "control_mapping_write" ON "control_mapping" FOR ALL
  USING (EXISTS (SELECT 1 FROM "control" c WHERE c."id" = "control_id"
    AND c."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "control" c WHERE c."id" = "control_id"
    AND c."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));

-- 3) новые таблицы EP-VPARITY (CASCADE снимает их FK/индексы/политики + FK из базовых колонок)
DROP TABLE IF EXISTS "entity_acl" CASCADE;
DROP TABLE IF EXISTS "contract" CASCADE;
DROP TABLE IF EXISTS "trust_activity" CASCADE;
DROP TABLE IF EXISTS "audit_firm" CASCADE;
DROP TABLE IF EXISTS "evidence_review" CASCADE;
DROP TABLE IF EXISTS "task" CASCADE;
DROP TABLE IF EXISTS "framework_activation" CASCADE;

-- 4) снятие добавленных колонок с базовых таблиц
ALTER TABLE "code_change" DROP COLUMN IF EXISTS "asset_id";
ALTER TABLE "commitment" DROP COLUMN IF EXISTS "contract_id";
ALTER TABLE "connector" DROP COLUMN IF EXISTS "sync_interval_minutes";
ALTER TABLE "document" DROP COLUMN IF EXISTS "category";
ALTER TABLE "framework" DROP COLUMN IF EXISTS "domain";
ALTER TABLE "framework" DROP COLUMN IF EXISTS "previous_version_id";
ALTER TABLE "framework" DROP COLUMN IF EXISTS "update_notes";
ALTER TABLE "kb_entry" DROP COLUMN IF EXISTS "owner_membership_id";
ALTER TABLE "kb_entry" DROP COLUMN IF EXISTS "expires_at";
ALTER TABLE "kb_entry" DROP COLUMN IF EXISTS "trust_visible";
ALTER TABLE "policy" DROP COLUMN IF EXISTS "renewal_reminder_sent_at";
ALTER TABLE "privacy_assessment" DROP COLUMN IF EXISTS "approver_membership_id";
ALTER TABLE "privacy_assessment" DROP COLUMN IF EXISTS "approved_at";
ALTER TABLE "privacy_assessment" DROP COLUMN IF EXISTS "review_date";
ALTER TABLE "processing_activity" DROP COLUMN IF EXISTS "vendor_id";
ALTER TABLE "processing_activity" DROP COLUMN IF EXISTS "data_locations";
ALTER TABLE "processing_activity" DROP COLUMN IF EXISTS "review_owner_membership_id";
ALTER TABLE "processing_activity" DROP COLUMN IF EXISTS "review_date";
ALTER TABLE "report_snapshot" DROP COLUMN IF EXISTS "composition";
ALTER TABLE "risk" DROP COLUMN IF EXISTS "approval_status";
ALTER TABLE "risk" DROP COLUMN IF EXISTS "approved_at";
ALTER TABLE "security_alert" DROP COLUMN IF EXISTS "category";
ALTER TABLE "security_alert" DROP COLUMN IF EXISTS "asset_id";
ALTER TABLE "security_alert" DROP COLUMN IF EXISTS "due_date";
ALTER TABLE "security_alert" DROP COLUMN IF EXISTS "sla_status";
ALTER TABLE "tenant_ai_config" DROP COLUMN IF EXISTS "memory";
ALTER TABLE "test" DROP COLUMN IF EXISTS "category";
ALTER TABLE "trust_access_request" DROP COLUMN IF EXISTS "token";
ALTER TABLE "vulnerability" DROP COLUMN IF EXISTS "asset_id";
