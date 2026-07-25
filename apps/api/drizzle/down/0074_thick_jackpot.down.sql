-- Откат 0074_thick_jackpot (T-OPS03: восстановление пропущенной пары)
ALTER TABLE "questionnaire" DROP CONSTRAINT IF EXISTS "questionnaire_owner_membership_id_membership_id_fk";
ALTER TABLE "questionnaire" DROP COLUMN IF EXISTS "due_date";
ALTER TABLE "questionnaire" DROP COLUMN IF EXISTS "owner_membership_id";
