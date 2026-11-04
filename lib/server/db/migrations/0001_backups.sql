CREATE TABLE `backups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`backup_date` text NOT NULL,
	`file_name` text NOT NULL,
	`status` text NOT NULL,
	`integrity` text,
	`request_count` integer,
	`upload_files` integer,
	`upload_files_copied` integer,
	`missing_files` integer,
	`bytes` integer,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `backups_status_idx` ON `backups` (`status`,`finished_at`);