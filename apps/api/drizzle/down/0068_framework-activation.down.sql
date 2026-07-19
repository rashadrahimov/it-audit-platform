-- Откат 0068_framework-activation
DROP TABLE "framework_activation";
ALTER TABLE "framework" DROP COLUMN "domain";
