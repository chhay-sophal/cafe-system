PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_store_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`exchange_rate_riel_per_usd` real DEFAULT 4100 NOT NULL,
	`main_currency` text DEFAULT 'KHR' NOT NULL,
	`tax_enabled` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO `__new_store_settings`("id", "exchange_rate_riel_per_usd", "main_currency", "tax_enabled", "updated_at") SELECT "id", "exchange_rate_riel_per_usd", "main_currency", "tax_enabled", "updated_at" FROM `store_settings`;--> statement-breakpoint
DROP TABLE `store_settings`;--> statement-breakpoint
ALTER TABLE `__new_store_settings` RENAME TO `store_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;