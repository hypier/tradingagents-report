CREATE TABLE IF NOT EXISTS "analysis_exchanges" (
	"exchange" text PRIMARY KEY NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"display_name" text NOT NULL,
	"market" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "analysis_exchanges" ("exchange", "enabled", "display_name", "market")
VALUES
	('NASDAQ', 1, 'NASDAQ', 'US'),
	('NYSE', 1, 'NYSE', 'US'),
	('AMEX', 1, 'Arca', 'US'),
	('OTC', 1, 'OTC', 'US'),
	('HKEX', 1, 'HKEX', 'HK'),
	('SSE', 1, 'SSE', 'CN'),
	('SZSE', 1, 'SZSE', 'CN'),
	('TSE', 1, 'TSE', NULL),
	('TWSE', 1, 'TWSE', NULL),
	('TPEX', 1, 'TPEx', NULL)
ON CONFLICT ("exchange") DO NOTHING;
--> statement-breakpoint
DROP TABLE IF EXISTS "market_configs";
