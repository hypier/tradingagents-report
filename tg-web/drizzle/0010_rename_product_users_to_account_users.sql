-- Rename product_users back to account_users (table + indexes).
-- FK constraint names keep historical suffixes; references follow the renamed table.
ALTER TABLE "product_users" RENAME TO "account_users";
--> statement-breakpoint
ALTER INDEX IF EXISTS "product_users_pkey" RENAME TO "account_users_pkey";
--> statement-breakpoint
ALTER INDEX IF EXISTS "product_users_stripe_customer_key" RENAME TO "account_users_stripe_customer_key";
--> statement-breakpoint
ALTER INDEX IF EXISTS "product_users_referral_code_key" RENAME TO "account_users_referral_code_key";
