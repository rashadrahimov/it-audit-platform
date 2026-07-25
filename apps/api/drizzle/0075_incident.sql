CREATE TABLE "incident" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'detected' NOT NULL,
	"category" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triaged_at" timestamp with time zone,
	"contained_at" timestamp with time zone,
	"eradicated_at" timestamp with time zone,
	"recovered_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"commander_membership_id" uuid,
	"due_date" timestamp with time zone,
	"sla_status" text DEFAULT 'ok' NOT NULL,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"note" text,
	"author_membership_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_commander_membership_id_membership_id_fk" FOREIGN KEY ("commander_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_author_membership_id_membership_id_fk" FOREIGN KEY ("author_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incident_tenant_idx" ON "incident" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_tenant_ref_uq" ON "incident" USING btree ("tenant_id","ref");--> statement-breakpoint
CREATE INDEX "incident_event_tenant_idx" ON "incident_event" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "incident_event_incident_idx" ON "incident_event" USING btree ("incident_id");--> statement-breakpoint
ALTER TABLE "incident" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "incident" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "incident"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "incident_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "incident_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "incident_event"
  USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);