ALTER TABLE "risk" ADD COLUMN IF NOT EXISTS "custom" jsonb DEFAULT '{}'::jsonb NOT NULL;
