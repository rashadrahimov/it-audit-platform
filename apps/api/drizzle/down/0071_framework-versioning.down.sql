-- Откат 0071_framework-versioning
ALTER TABLE "framework" DROP COLUMN "previous_version_id";
ALTER TABLE "framework" DROP COLUMN "update_notes";
