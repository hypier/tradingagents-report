-- Dual-balance credits: subscription period vs activity bonus.
ALTER TABLE "credit_accounts" ADD COLUMN IF NOT EXISTS "period_credits" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD COLUMN IF NOT EXISTS "bonus_credits" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD COLUMN IF NOT EXISTS "period_baseline_credits" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD COLUMN IF NOT EXISTS "period_end" timestamp with time zone;
--> statement-breakpoint
-- Preserve existing balances as non-expiring bonus so the first renewal does not wipe history.
UPDATE "credit_accounts"
SET
  "bonus_credits" = "available_credits",
  "period_credits" = 0,
  "period_baseline_credits" = 0,
  "period_end" = NULL
WHERE "bonus_credits" = 0
  AND "period_credits" = 0
  AND "available_credits" <> 0;
