ALTER TABLE "test" ADD COLUMN "connector_id" uuid;--> statement-breakpoint
ALTER TABLE "test" ADD CONSTRAINT "test_connector_id_connector_id_fk"
  FOREIGN KEY ("connector_id") REFERENCES "connector"("id") ON DELETE SET NULL;
