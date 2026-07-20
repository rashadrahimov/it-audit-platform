ALTER TABLE "commitment" DROP CONSTRAINT IF EXISTS "commitment_contract_id_contract_id_fk";
ALTER TABLE "commitment" DROP COLUMN IF EXISTS "contract_id";
DROP POLICY IF EXISTS "tenant_isolation" ON "contract";
DROP TABLE IF EXISTS "contract";
