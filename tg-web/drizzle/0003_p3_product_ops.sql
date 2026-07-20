CREATE TABLE IF NOT EXISTS "report_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"analysis_job_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"max_views" integer,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_share_links_token_key" ON "report_share_links" USING btree ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_share_links_job_idx" ON "report_share_links" USING btree ("analysis_job_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_metadata" (
	"code" text PRIMARY KEY NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"display_name" text NOT NULL,
	"timezone" text NOT NULL,
	"currency" text NOT NULL,
	"session_notes" text,
	"disclaimer" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"market" text,
	"min_analysts" integer DEFAULT 1 NOT NULL,
	"max_analysts" integer DEFAULT 99 NOT NULL,
	"units" integer NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_rules_priority_idx" ON "credit_rules" USING btree ("priority");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_clerk_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_events_created_idx" ON "admin_audit_events" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_events_action_idx" ON "admin_audit_events" USING btree ("action");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_events_actor_idx" ON "admin_audit_events" USING btree ("actor_clerk_user_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_share_links" ADD CONSTRAINT "report_share_links_analysis_job_id_analysis_jobs_id_fk" FOREIGN KEY ("analysis_job_id") REFERENCES "public"."analysis_jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_share_links" ADD CONSTRAINT "report_share_links_clerk_user_id_product_users_clerk_user_id_fk" FOREIGN KEY ("clerk_user_id") REFERENCES "public"."product_users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "market_metadata" ("code", "enabled", "display_name", "timezone", "currency", "session_notes", "disclaimer", "sort_order")
VALUES
	('US', 1, 'United States', 'America/New_York', 'USD', 'Regular session 09:30–16:00 ET', NULL, 10),
	('HK', 1, 'Hong Kong', 'Asia/Hong_Kong', 'HKD', 'Regular session 09:30–16:00 HKT', NULL, 20),
	('CN', 1, 'China A-shares', 'Asia/Shanghai', 'CNY', 'Regular session 09:30–15:00 CST', NULL, 30),
	('CRYPTO', 1, 'Crypto', 'UTC', 'USD', '24/7 trading', NULL, 40)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "credit_rules" ("id", "label", "market", "min_analysts", "max_analysts", "units", "enabled", "priority")
VALUES
	('00000000-0000-4000-8000-000000000001', 'Default 1 credit', NULL, 1, 99, 1, 1, 0)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "product_settings" ("key", "value", "updated_by")
VALUES
	('maintenance', '{"enabled":false,"message":{"en":"","zh":""}}'::jsonb, NULL),
	('features', '{"watchlist":true,"shareLinks":true}'::jsonb, NULL),
	('disclaimer', '{"version":null,"markdown":{"en":null,"zh":null}}'::jsonb, NULL),
	('alerts', '{"webhookUrl":""}'::jsonb, NULL)
ON CONFLICT ("key") DO NOTHING;
