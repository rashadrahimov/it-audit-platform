DROP TABLE "evidence_request";--> statement-breakpoint
DROP TABLE "auditor_assessment";--> statement-breakpoint
ALTER TABLE "membership" DROP COLUMN "data_access_until";--> statement-breakpoint
ALTER TABLE "membership" DROP COLUMN "data_access_from";--> statement-breakpoint
ALTER TABLE "document_link" DROP COLUMN "review_status";
