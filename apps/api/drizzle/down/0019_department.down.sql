-- Откат 0019_department
ALTER TABLE "membership" DROP COLUMN "department_id";
DROP TABLE "department";
