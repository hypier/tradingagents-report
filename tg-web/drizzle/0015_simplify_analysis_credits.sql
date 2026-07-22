-- Simplify analysis credits: move billing/rewards into system_settings,
-- hang ownership + pricing on analysis_jobs, drop reservation and old config tables.

ALTER TABLE "analysis_jobs" ADD COLUMN IF NOT EXISTS "clerk_user_id" text;
--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN IF NOT EXISTS "credit_pricing" jsonb;
--> statement-breakpoint
UPDATE "analysis_jobs" AS job
SET
  "clerk_user_id" = reservation."clerk_user_id",
  "credit_pricing" = reservation."pricing_snapshot"
FROM "credit_reservations" AS reservation
WHERE reservation."analysis_job_id" = job."id"
  AND job."clerk_user_id" IS NULL;
--> statement-breakpoint
UPDATE "analysis_jobs" AS job
SET
  "clerk_user_id" = reservation."clerk_user_id",
  "credit_pricing" = COALESCE(job."credit_pricing", reservation."pricing_snapshot")
FROM "credit_reservations" AS reservation
WHERE reservation."request_id" = job."request_id"
  AND job."clerk_user_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analysis_jobs_user_created_idx"
  ON "analysis_jobs" USING btree ("clerk_user_id", "created_at" desc);
--> statement-breakpoint
INSERT INTO "system_settings" ("key", "value", "updated_at")
SELECT
  'billing',
  jsonb_build_object(
    'analysisBalanceThreshold', 0,
    'pointsPerUsd', "points_per_usd"::text,
    'markupBasisPoints', "markup_basis_points"
  ),
  now()
FROM "credit_billing_settings"
WHERE "id" = 'default'
ON CONFLICT ("key") DO UPDATE
SET
  "value" = EXCLUDED."value",
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_settings" ("key", "value", "updated_at")
SELECT
  'rewards',
  jsonb_build_object(
    'signup', jsonb_build_object(
      'enabled', true,
      'points', CEIL(("signup_grant_usd"::numeric) * ("points_per_usd"::numeric))::int
    ),
    'referral', jsonb_build_object(
      'enabled', true,
      'points', CEIL(("referral_reward_usd"::numeric) * ("points_per_usd"::numeric))::int
    ),
    'campaign', jsonb_build_object(
      'enabled', false,
      'points', 0,
      'label', '',
      'code', null
    )
  ),
  now()
FROM "credit_billing_settings"
WHERE "id" = 'default'
ON CONFLICT ("key") DO UPDATE
SET
  "value" = EXCLUDED."value",
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_settings" ("key", "value", "updated_at")
VALUES (
  'billing',
  '{"analysisBalanceThreshold":0,"pointsPerUsd":"100","markupBasisPoints":1000}'::jsonb,
  now()
)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "system_settings" ("key", "value", "updated_at")
VALUES (
  'rewards',
  '{"signup":{"enabled":true,"points":500},"referral":{"enabled":true,"points":200},"campaign":{"enabled":false,"points":0,"label":"","code":null}}'::jsonb,
  now()
)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
DROP TABLE IF EXISTS "credit_reservations";
--> statement-breakpoint
DROP TABLE IF EXISTS "credit_billing_setting_events";
--> statement-breakpoint
DROP TABLE IF EXISTS "credit_billing_settings";
--> statement-breakpoint
DROP TABLE IF EXISTS "credit_rules";
