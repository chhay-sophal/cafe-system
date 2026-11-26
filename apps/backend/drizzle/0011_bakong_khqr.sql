CREATE TABLE `bakong_credentials` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`registered_email` text,
	`api_token` text,
	`api_token_updated_at` text
);
--> statement-breakpoint
ALTER TABLE `payments` ADD `khqr_md5` text;