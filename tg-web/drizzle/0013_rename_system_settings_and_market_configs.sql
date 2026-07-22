-- Rename product ops tables for clearer semantics:
-- product_settings → system_settings (系统设置)
-- market_metadata → market_configs (可运营市场配置)
ALTER TABLE "product_settings" RENAME TO "system_settings";
--> statement-breakpoint
ALTER TABLE "market_metadata" RENAME TO "market_configs";
