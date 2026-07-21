CREATE TABLE "referral_relationships" (
	"invitee_clerk_user_id" text PRIMARY KEY NOT NULL,
	"inviter_clerk_user_id" text NOT NULL,
	"referral_code" text NOT NULL,
	"points_per_usd" numeric(18, 6) NOT NULL,
	"signup_grant_usd" numeric(18, 2) NOT NULL,
	"signup_grant_points" bigint NOT NULL,
	"referral_reward_usd" numeric(18, 2) NOT NULL,
	"referral_reward_points" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_relationships_distinct_users_check" CHECK ("referral_relationships"."invitee_clerk_user_id" <> "referral_relationships"."inviter_clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "product_users" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "product_users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "product_users"
SET "referral_code" = replace(gen_random_uuid()::text, '-', ''),
	"onboarding_completed_at" = now();--> statement-breakpoint
ALTER TABLE "product_users" ALTER COLUMN "referral_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_billing_settings" ADD COLUMN "signup_grant_usd" numeric(18, 2) DEFAULT '5.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_billing_settings" ADD COLUMN "referral_reward_usd" numeric(18, 2) DEFAULT '2.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_relationships" ADD CONSTRAINT "referral_relationships_invitee_clerk_user_id_product_users_clerk_user_id_fk" FOREIGN KEY ("invitee_clerk_user_id") REFERENCES "public"."product_users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_relationships" ADD CONSTRAINT "referral_relationships_inviter_clerk_user_id_product_users_clerk_user_id_fk" FOREIGN KEY ("inviter_clerk_user_id") REFERENCES "public"."product_users"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referral_relationships_inviter_created_idx" ON "referral_relationships" USING btree ("inviter_clerk_user_id","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "product_users_referral_code_key" ON "product_users" USING btree ("referral_code");
