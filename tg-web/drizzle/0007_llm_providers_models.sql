CREATE TABLE IF NOT EXISTS "llm_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"backend_url" text,
	"api_key_ciphertext" text,
	"api_key_hint" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"model" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'both' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"unit_tokens" integer DEFAULT 1000000 NOT NULL,
	"input_price" numeric(18, 8),
	"output_price" numeric(18, 8),
	"cached_input_price" numeric(18, 8),
	"cache_write_price" numeric(18, 8),
	"context_window" integer,
	"max_output_tokens" integer,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"synced_at" timestamp with time zone,
	"sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_models" ADD CONSTRAINT "llm_models_provider_id_llm_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."llm_providers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "llm_models_provider_model_uidx" ON "llm_models" USING btree ("provider_id","model");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_models_enabled_idx" ON "llm_models" USING btree ("enabled");
--> statement-breakpoint
DROP TABLE IF EXISTS "llm_pricing_sources" CASCADE;
