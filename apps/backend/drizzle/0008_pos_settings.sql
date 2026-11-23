CREATE TABLE `pos_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`settings` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
