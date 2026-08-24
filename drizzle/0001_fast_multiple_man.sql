CREATE TABLE `request_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_number` text NOT NULL,
	`action` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`actor_email` text DEFAULT 'system' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `requests` ADD `sheet_sync_status` text DEFAULT 'NOT_CONFIGURED' NOT NULL;--> statement-breakpoint
ALTER TABLE `requests` ADD `email_receipt_status` text DEFAULT 'NOT_CONFIGURED' NOT NULL;--> statement-breakpoint
ALTER TABLE `requests` ADD `sync_error` text;--> statement-breakpoint
ALTER TABLE `requests` ADD `last_synced_at` text;--> statement-breakpoint
ALTER TABLE `requests` ADD `completed_at` text;