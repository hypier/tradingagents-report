-- Flatten watchlist to a single favorites table and drop legal consent storage.
DROP TABLE IF EXISTS "watchlist_item_tags";
--> statement-breakpoint
DROP TABLE IF EXISTS "watchlist_tags";
--> statement-breakpoint
-- Keep one row per (user, provider_symbol); prefer the earliest favorite.
DELETE FROM "watchlist_items" a
USING "watchlist_items" b
WHERE a."clerk_user_id" = b."clerk_user_id"
  AND a."provider_symbol" = b."provider_symbol"
  AND (
    a."created_at" > b."created_at"
    OR (a."created_at" = b."created_at" AND a."id"::text > b."id"::text)
  );
--> statement-breakpoint
ALTER TABLE "watchlist_items" DROP CONSTRAINT IF EXISTS "watchlist_items_group_id_watchlist_groups_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "watchlist_items_group_provider_key";
--> statement-breakpoint
ALTER TABLE "watchlist_items" DROP COLUMN IF EXISTS "group_id";
--> statement-breakpoint
ALTER TABLE "watchlist_items" DROP COLUMN IF EXISTS "notes";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watchlist_items_user_provider_key"
  ON "watchlist_items" USING btree ("clerk_user_id", "provider_symbol");
--> statement-breakpoint
DROP TABLE IF EXISTS "watchlist_groups";
--> statement-breakpoint
DROP TABLE IF EXISTS "user_consents";
