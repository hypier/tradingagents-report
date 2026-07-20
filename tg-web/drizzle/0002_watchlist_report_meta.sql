CREATE TABLE IF NOT EXISTS "watchlist_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"exchange" text NOT NULL,
	"symbol" text NOT NULL,
	"display_ticker" text NOT NULL,
	"provider_symbol" text NOT NULL,
	"display_name" text NOT NULL,
	"logo_url" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlist_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlist_item_tags" (
	"item_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "watchlist_item_tags_item_id_tag_id_pk" PRIMARY KEY("item_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_report_meta" (
	"clerk_user_id" text NOT NULL,
	"analysis_job_id" uuid NOT NULL,
	"is_favorite" integer DEFAULT 0 NOT NULL,
	"is_archived" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_report_meta_clerk_user_id_analysis_job_id_pk" PRIMARY KEY("clerk_user_id","analysis_job_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_groups" ADD CONSTRAINT "watchlist_groups_clerk_user_id_product_users_clerk_user_id_fk" FOREIGN KEY ("clerk_user_id") REFERENCES "public"."product_users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_group_id_watchlist_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."watchlist_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_clerk_user_id_product_users_clerk_user_id_fk" FOREIGN KEY ("clerk_user_id") REFERENCES "public"."product_users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_tags" ADD CONSTRAINT "watchlist_tags_clerk_user_id_product_users_clerk_user_id_fk" FOREIGN KEY ("clerk_user_id") REFERENCES "public"."product_users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_item_tags" ADD CONSTRAINT "watchlist_item_tags_item_id_watchlist_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."watchlist_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_item_tags" ADD CONSTRAINT "watchlist_item_tags_tag_id_watchlist_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."watchlist_tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_report_meta" ADD CONSTRAINT "user_report_meta_clerk_user_id_product_users_clerk_user_id_fk" FOREIGN KEY ("clerk_user_id") REFERENCES "public"."product_users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watchlist_groups_user_sort_idx" ON "watchlist_groups" USING btree ("clerk_user_id","sort_order");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watchlist_items_group_provider_key" ON "watchlist_items" USING btree ("group_id","provider_symbol");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watchlist_items_user_sort_idx" ON "watchlist_items" USING btree ("clerk_user_id","sort_order");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watchlist_tags_user_name_key" ON "watchlist_tags" USING btree ("clerk_user_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_report_meta_user_favorite_idx" ON "user_report_meta" USING btree ("clerk_user_id","is_favorite");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_report_meta_user_archived_idx" ON "user_report_meta" USING btree ("clerk_user_id","is_archived");
