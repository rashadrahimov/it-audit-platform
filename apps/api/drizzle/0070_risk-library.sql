ALTER TABLE "risk" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "risk";--> statement-breakpoint
CREATE POLICY "risk_read" ON "risk" FOR SELECT
  USING ("tenant_id" IS NULL OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "risk_write" ON "risk" FOR ALL
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
