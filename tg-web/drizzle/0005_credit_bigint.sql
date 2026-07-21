ALTER TABLE "credit_accounts" ALTER COLUMN "available_credits" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "credit_accounts" ALTER COLUMN "reserved_credits" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "credit_accounts" ALTER COLUMN "spent_credits" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ALTER COLUMN "available_delta" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ALTER COLUMN "reserved_delta" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ALTER COLUMN "spent_delta" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "credit_reservations" ALTER COLUMN "units" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "credit_reservations" ALTER COLUMN "settled_units" SET DATA TYPE bigint;--> statement-breakpoint
CREATE INDEX "credit_reservations_billing_signature_idx" ON "credit_reservations" USING btree (("pricing_snapshot"->>'billing_signature'));