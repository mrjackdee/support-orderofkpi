CREATE TABLE `deflections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic_code` text NOT NULL,
	`tip_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`message_id` integer,
	`storage_key` text NOT NULL,
	`original_name` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`uploaded_by_email` text NOT NULL,
	`uploaded_by_name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_storage_key_unique` ON `files` (`storage_key`);--> statement-breakpoint
CREATE INDEX `files_request_idx` ON `files` (`request_id`);--> statement-breakpoint
CREATE TABLE `history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`action` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`actor_email` text NOT NULL,
	`actor_name` text NOT NULL,
	`member_visible` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `history_request_idx` ON `history` (`request_id`);--> statement-breakpoint
CREATE TABLE `internal_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`author_email` text NOT NULL,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `internal_notes_request_idx` ON `internal_notes` (`request_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`author_email` text NOT NULL,
	`author_person_id` text,
	`author_name` text NOT NULL,
	`author_role` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `messages_request_idx` ON `messages` (`request_id`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`to_address` text NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`text` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`last_error` text,
	`request_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
CREATE INDEX `outbox_status_idx` ON `outbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `people` (
	`email` text PRIMARY KEY NOT NULL,
	`person_id` text,
	`name` text NOT NULL,
	`claims` text NOT NULL,
	`last_seen_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_counters` (
	`topic_code` text NOT NULL,
	`year` integer NOT NULL,
	`next_value` integer NOT NULL,
	PRIMARY KEY(`topic_code`, `year`)
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_number` text NOT NULL,
	`topic_code` text NOT NULL,
	`requester_person_id` text,
	`requester_name` text NOT NULL,
	`requester_email` text NOT NULL,
	`urgency` text NOT NULL,
	`subject` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'RECEIVED' NOT NULL,
	`routed_committee` text NOT NULL,
	`chosen_committee` text,
	`assignee_email` text,
	`assignee_name` text,
	`first_response_at` integer,
	`completed_at` integer,
	`reopen_until` integer,
	`response_due_at` integer NOT NULL,
	`waiting_since` integer,
	`client_token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `requests_request_number_unique` ON `requests` (`request_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `requests_client_token_unique` ON `requests` (`client_token`);--> statement-breakpoint
CREATE INDEX `requests_requester_email_idx` ON `requests` (`requester_email`);--> statement-breakpoint
CREATE INDEX `requests_requester_person_idx` ON `requests` (`requester_person_id`);--> statement-breakpoint
CREATE INDEX `requests_status_idx` ON `requests` (`status`);--> statement-breakpoint
CREATE INDEX `requests_routed_idx` ON `requests` (`routed_committee`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`person_id` text,
	`claims` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`checked_at` integer NOT NULL,
	`last_good_check_at` integer NOT NULL,
	`check_failed_at` integer,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_email_idx` ON `sessions` (`email`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`code` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`description` text NOT NULL,
	`default_route` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
