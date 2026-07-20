DROP POLICY IF EXISTS "trust_activity_isolation" ON "trust_activity";
DROP TABLE IF EXISTS "trust_activity";
ALTER TABLE "trust_access_request" DROP COLUMN IF EXISTS "token";
