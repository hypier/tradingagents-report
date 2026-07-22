ALTER TABLE "llm_providers" ADD COLUMN IF NOT EXISTS "driver" text;
--> statement-breakpoint
UPDATE "llm_providers" SET "driver" = "id" WHERE "driver" IS NULL;
--> statement-breakpoint
ALTER TABLE "llm_providers" ALTER COLUMN "driver" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_providers_driver_idx" ON "llm_providers" USING btree ("driver");
