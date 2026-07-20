CREATE TABLE "credit_billing_setting_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"previous_settings" jsonb,
	"next_settings" jsonb NOT NULL,
	"actor_clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_billing_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"points_per_usd" numeric(18, 6) DEFAULT '100' NOT NULL,
	"markup_basis_points" integer DEFAULT 1000 NOT NULL,
	"reserve_buffer_basis_points" integer DEFAULT 2000 NOT NULL,
	"default_estimated_cost_usd" numeric(18, 8) DEFAULT '1.00000000' NOT NULL,
	"updated_by_clerk_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD COLUMN "estimated_cost_usd" numeric(18, 8);--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD COLUMN "pricing_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD COLUMN "settled_units" integer;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD COLUMN "settled_cost_usd" numeric(18, 8);