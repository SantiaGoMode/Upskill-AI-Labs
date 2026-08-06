CREATE TABLE `lesson_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`module_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`score` integer,
	`total` integer,
	`completed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lesson_progress_owner_idx` ON `lesson_progress` (`owner_email`);--> statement-breakpoint
CREATE INDEX `lesson_progress_lesson_idx` ON `lesson_progress` (`owner_email`,`lesson_id`);