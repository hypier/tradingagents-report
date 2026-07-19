CREATE TABLE IF NOT EXISTS "product_users" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"avatar_url" text DEFAULT '' NOT NULL,
	"interface_language" text DEFAULT 'en' NOT NULL,
	"report_language" text DEFAULT 'English' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"default_market" text DEFAULT 'US' NOT NULL,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"document_type" text NOT NULL,
	"document_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_subscriptions" (
	"stripe_subscription_id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"status" text NOT NULL,
	"cancel_at_period_end" integer DEFAULT 0 NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"latest_invoice_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_accounts" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"available_credits" integer DEFAULT 0 NOT NULL,
	"reserved_credits" integer DEFAULT 0 NOT NULL,
	"spent_credits" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_reservations" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"analysis_job_id" uuid,
	"units" integer NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "credit_reservations_units_check" CHECK ("credit_reservations"."units" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"entry_type" text NOT NULL,
	"available_delta" integer DEFAULT 0 NOT NULL,
	"reserved_delta" integer DEFAULT 0 NOT NULL,
	"spent_delta" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
	"stripe_event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_provider_configs" (
	"provider" text PRIMARY KEY NOT NULL,
	"secret_key_ciphertext" text NOT NULL,
	"webhook_secret_ciphertext" text NOT NULL,
	"updated_by_clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_config_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"action" text NOT NULL,
	"actor_clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_clerk_user_id_product_users_clerk_user_id_fk" FOREIGN KEY ("clerk_user_id") REFERENCES "public"."product_users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_clerk_user_id_product_users_clerk_user_id_fk" FOREIGN KEY ("clerk_user_id") REFERENCES "public"."product_users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_clerk_user_id_product_users_clerk_user_id_fk" FOREIGN KEY ("clerk_user_id") REFERENCES "public"."product_users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_clerk_user_id_product_users_clerk_user_id_fk" FOREIGN KEY ("clerk_user_id") REFERENCES "public"."product_users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_clerk_user_id_product_users_clerk_user_id_fk" FOREIGN KEY ("clerk_user_id") REFERENCES "public"."product_users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_config_audit_provider_created_idx" ON "billing_config_audit_events" USING btree ("provider","created_at" desc);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_subscriptions_user_status_idx" ON "billing_subscriptions" USING btree ("clerk_user_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_idempotency_key" ON "credit_ledger_entries" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_user_created_idx" ON "credit_ledger_entries" USING btree ("clerk_user_id","created_at" desc);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_reservations_analysis_job_key" ON "credit_reservations" USING btree ("analysis_job_id") WHERE "credit_reservations"."analysis_job_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_reservations_user_created_idx" ON "credit_reservations" USING btree ("clerk_user_id","created_at" desc);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_users_stripe_customer_key" ON "product_users" USING btree ("stripe_customer_id") WHERE "product_users"."stripe_customer_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_consents_document_key" ON "user_consents" USING btree ("clerk_user_id","document_type","document_version");
