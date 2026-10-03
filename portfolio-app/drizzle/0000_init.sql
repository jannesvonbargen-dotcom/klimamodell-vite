CREATE TABLE `import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_name` text NOT NULL,
	`preset` text NOT NULL,
	`row_count` integer NOT NULL,
	`imported_count` integer NOT NULL,
	`skipped_count` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `instruments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`isin` text NOT NULL,
	`wkn` text,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'STOCK' NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`sector` text,
	`country` text,
	`logo_url` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instruments_isin_idx` ON `instruments` (`isin`);--> statement-breakpoint
CREATE INDEX `instruments_symbol_idx` ON `instruments` (`symbol`);--> statement-breakpoint
CREATE TABLE `market_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`source` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`symbol` text NOT NULL,
	`date` text NOT NULL,
	`close` text NOT NULL,
	`currency` text NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`symbol`, `date`)
);
--> statement-breakpoint
CREATE TABLE `savings_plan_executions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`due_date` text NOT NULL,
	`status` text NOT NULL,
	`transaction_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `savings_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spe_plan_date_idx` ON `savings_plan_executions` (`plan_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `savings_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instrument_id` integer NOT NULL,
	`amount` text NOT NULL,
	`interval` text DEFAULT 'MONTHLY' NOT NULL,
	`execution_day` integer DEFAULT 1 NOT NULL,
	`start_date` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`fee` text DEFAULT '0' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `splits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instrument_id` integer NOT NULL,
	`effective_date` text NOT NULL,
	`ratio_from` text DEFAULT '1' NOT NULL,
	`ratio_to` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `splits_instrument_date_idx` ON `splits` (`instrument_id`,`effective_date`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`executed_at` text NOT NULL,
	`instrument_id` integer,
	`quantity` text,
	`price` text,
	`amount` text,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`fx_rate` text DEFAULT '1' NOT NULL,
	`fee` text DEFAULT '0' NOT NULL,
	`tax` text DEFAULT '0' NOT NULL,
	`note` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`dedupe_key` text,
	`import_batch_id` integer,
	`savings_plan_id` integer,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `transactions_executed_at_idx` ON `transactions` (`executed_at`);--> statement-breakpoint
CREATE INDEX `transactions_instrument_idx` ON `transactions` (`instrument_id`);--> statement-breakpoint
CREATE INDEX `transactions_dedupe_idx` ON `transactions` (`dedupe_key`);--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`isin` text,
	`currency` text DEFAULT 'USD' NOT NULL,
	`alert_above` text,
	`alert_below` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watchlist_symbol_idx` ON `watchlist` (`symbol`);