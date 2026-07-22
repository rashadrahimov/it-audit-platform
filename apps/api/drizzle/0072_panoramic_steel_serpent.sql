ALTER TABLE "document" ADD COLUMN "extracted_text" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "extraction_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_extracted_text_fts_idx" ON "document"
  USING gin (to_tsvector('simple', coalesce("extracted_text", '')));
