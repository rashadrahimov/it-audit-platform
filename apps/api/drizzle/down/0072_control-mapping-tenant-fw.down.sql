-- Откат 0072: вернуть control_mapping_write к control-only условию
DROP POLICY "control_mapping_write" ON "control_mapping";
CREATE POLICY "control_mapping_write" ON "control_mapping" FOR ALL
  USING (EXISTS (SELECT 1 FROM "control" c WHERE c."id" = "control_id"
    AND c."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM "control" c WHERE c."id" = "control_id"
    AND c."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
