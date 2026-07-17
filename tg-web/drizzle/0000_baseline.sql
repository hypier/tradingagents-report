CREATE TABLE IF NOT EXISTS "analysis_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid,
	"ticker" text NOT NULL,
	"exchange" text,
	"trade_date" date NOT NULL,
	"asset_type" text NOT NULL,
	"analysts" jsonb NOT NULL,
	"status" text NOT NULL,
	"request" jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"display" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"final_state" jsonb,
	"decision" text,
	"error" text,
	"report_path" text,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"token_usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_usd" numeric(18, 8) DEFAULT '0' NOT NULL,
	"cost_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"current_step" text,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "analysis_jobs_status_check" CHECK ("analysis_jobs"."status" in ('queued', 'running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_model_prices" (
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"billing_mode" text DEFAULT 'standard' NOT NULL,
	"context_tier" text DEFAULT 'short' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"unit_tokens" integer DEFAULT 1000000 NOT NULL,
	"input_price" numeric(18, 8) NOT NULL,
	"cached_input_price" numeric(18, 8),
	"cache_write_price" numeric(18, 8),
	"output_price" numeric(18, 8) NOT NULL,
	"source_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_model_prices_provider_model_billing_mode_context_tier_pk" PRIMARY KEY("provider","model","billing_mode","context_tier")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_pricing_sources" (
	"source_url" text PRIMARY KEY NOT NULL,
	"update_interval_seconds" integer DEFAULT 3600 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"model_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN IF NOT EXISTS "exchange" text;
--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN IF NOT EXISTS "display" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "analysis_jobs_request_id_key" ON "analysis_jobs" USING btree ("request_id") WHERE "analysis_jobs"."request_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analysis_jobs_ticker_created_idx" ON "analysis_jobs" USING btree ("ticker","created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analysis_jobs_status_created_idx" ON "analysis_jobs" USING btree ("status","created_at" DESC);
