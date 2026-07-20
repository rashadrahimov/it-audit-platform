ALTER TABLE "kb_entry" DROP CONSTRAINT IF EXISTS "kb_entry_owner_membership_id_membership_id_fk";
ALTER TABLE "kb_entry" DROP COLUMN IF EXISTS "owner_membership_id";
ALTER TABLE "kb_entry" DROP COLUMN IF EXISTS "expires_at";
