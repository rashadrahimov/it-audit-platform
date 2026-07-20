-- T-V46: тенант может маппить требования СВОЕЙ версии фреймворка на любой контрол
-- (в т.ч. глобальный) — иначе перенос маппингов на новую версию упирается в RLS.
DROP POLICY "control_mapping_write" ON "control_mapping";--> statement-breakpoint
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
