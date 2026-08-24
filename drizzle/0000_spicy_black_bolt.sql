CREATE TABLE `follow_ups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_number` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_number` text NOT NULL,
	`category_code` text NOT NULL,
	`category_label` text NOT NULL,
	`member_name` text NOT NULL,
	`member_email` text NOT NULL,
	`priority` text DEFAULT 'Normal' NOT NULL,
	`subject` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'RECEIVED' NOT NULL,
	`lead_contact` text DEFAULT 'KP Digital & Technology Committee' NOT NULL,
	`committee_notes` text DEFAULT 'Your request has been received and is waiting for review.' NOT NULL,
	`attachment_key` text,
	`attachment_name` text,
	`attachment_type` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `requests_request_number_unique` ON `requests` (`request_number`);