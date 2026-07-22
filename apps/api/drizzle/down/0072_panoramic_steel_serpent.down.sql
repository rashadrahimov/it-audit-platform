-- Откат 0072_panoramic_steel_serpent
DROP INDEX IF EXISTS "document_extracted_text_fts_idx";
ALTER TABLE "document" DROP COLUMN IF EXISTS "extraction_status";
ALTER TABLE "document" DROP COLUMN IF EXISTS "extracted_text";
