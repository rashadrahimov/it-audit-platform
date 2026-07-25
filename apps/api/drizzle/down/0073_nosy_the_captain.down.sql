-- Откат 0073_nosy_the_captain (T-OPS03: восстановление пропущенной пары)
ALTER TABLE "risk" DROP COLUMN IF EXISTS "custom";
