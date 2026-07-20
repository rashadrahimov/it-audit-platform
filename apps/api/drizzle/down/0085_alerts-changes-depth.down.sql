ALTER TABLE "code_change" DROP CONSTRAINT IF EXISTS "code_change_asset_id_asset_id_fk";
ALTER TABLE "security_alert" DROP CONSTRAINT IF EXISTS "security_alert_asset_id_asset_id_fk";
ALTER TABLE "code_change" DROP COLUMN IF EXISTS "asset_id";
ALTER TABLE "security_alert" DROP COLUMN IF EXISTS "sla_status";
ALTER TABLE "security_alert" DROP COLUMN IF EXISTS "due_date";
ALTER TABLE "security_alert" DROP COLUMN IF EXISTS "asset_id";
ALTER TABLE "security_alert" DROP COLUMN IF EXISTS "category";
