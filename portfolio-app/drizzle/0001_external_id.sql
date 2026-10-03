ALTER TABLE `transactions` ADD `external_id` text;--> statement-breakpoint
CREATE INDEX `transactions_external_idx` ON `transactions` (`external_id`);