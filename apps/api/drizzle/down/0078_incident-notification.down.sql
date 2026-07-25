-- Откат 0078_incident-notification (T-IR05, EP-INC)
ALTER TABLE "incident" DROP COLUMN IF EXISTS "notification_note";
ALTER TABLE "incident" DROP COLUMN IF EXISTS "notified_at";
ALTER TABLE "incident" DROP COLUMN IF EXISTS "notify_deadline_at";
ALTER TABLE "incident" DROP COLUMN IF EXISTS "regulator";
ALTER TABLE "incident" DROP COLUMN IF EXISTS "reportable";
