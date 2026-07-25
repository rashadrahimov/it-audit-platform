-- Откат 0077_incident-postmortem (T-IR04, EP-INC)
ALTER TABLE "incident" DROP COLUMN IF EXISTS "postmortem_at";
ALTER TABLE "incident" DROP COLUMN IF EXISTS "lessons_learned";
ALTER TABLE "incident" DROP COLUMN IF EXISTS "impact_summary";
ALTER TABLE "incident" DROP COLUMN IF EXISTS "root_cause";
