CREATE TABLE `eval_results` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`evaluator_version` text NOT NULL,
	`result_json` text NOT NULL,
	`passed` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `lab_submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `eval_results_submission_id_idx` ON `eval_results` (`submission_id`);--> statement-breakpoint
CREATE TABLE `lab_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`lab_id` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`draft_json` text DEFAULT '{}' NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`selected_sources_json` text DEFAULT '[]' NOT NULL,
	`verification` text DEFAULT '' NOT NULL,
	`seconds_remaining` integer DEFAULT 1500 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lab_attempts_lab_id_idx` ON `lab_attempts` (`lab_id`);--> statement-breakpoint
CREATE TABLE `lab_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `lab_attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lab_submissions_attempt_id_idx` ON `lab_submissions` (`attempt_id`);