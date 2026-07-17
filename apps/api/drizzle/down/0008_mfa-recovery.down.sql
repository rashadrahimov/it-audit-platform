-- Откат 0008_mfa-recovery
ALTER TABLE "user" DROP COLUMN "mfa_recovery_codes";
