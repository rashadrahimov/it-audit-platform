-- Откат 0070_risk-library
DELETE FROM "risk" WHERE "tenant_id" IS NULL;
DROP POLICY "risk_read" ON "risk";
DROP POLICY "risk_write" ON "risk";
CREATE POLICY "tenant_isolation" ON "risk"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE "risk" ALTER COLUMN "tenant_id" SET NOT NULL;
