ALTER TABLE `orders` ADD `client_order_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_orders_client_order_id` ON `orders` (`client_order_id`);