-- Fold referral_relationships into account_users.referred_by_clerk_user_id.
-- Reward amounts remain in credit_ledger_entries (reference_type = referral_reward).
ALTER TABLE "account_users" ADD COLUMN "referred_by_clerk_user_id" text;
--> statement-breakpoint
UPDATE "account_users" AS invitee
SET "referred_by_clerk_user_id" = relationship."inviter_clerk_user_id"
FROM "referral_relationships" AS relationship
WHERE invitee."clerk_user_id" = relationship."invitee_clerk_user_id"
  AND invitee."referred_by_clerk_user_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "account_users" ADD CONSTRAINT "account_users_referred_by_clerk_user_id_account_users_clerk_user_id_fk" FOREIGN KEY ("referred_by_clerk_user_id") REFERENCES "public"."account_users"("clerk_user_id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "account_users" ADD CONSTRAINT "account_users_referred_by_distinct_check" CHECK ("referred_by_clerk_user_id" is null or "referred_by_clerk_user_id" <> "clerk_user_id");
--> statement-breakpoint
CREATE INDEX "account_users_referred_by_idx" ON "account_users" USING btree ("referred_by_clerk_user_id");
--> statement-breakpoint
DROP TABLE "referral_relationships";
