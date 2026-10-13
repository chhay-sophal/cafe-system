ALTER TABLE `orders` ADD `voided_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `voided_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `orders` ADD `void_reason` text;