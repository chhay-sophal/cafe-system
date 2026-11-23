ALTER TABLE `orders` ADD `edited_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `edited_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `orders` ADD `edit_reason` text;