CREATE TABLE `human_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`reviewer_email` text NOT NULL,
	`result_json` text NOT NULL,
	`rationale` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `lab_submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `human_reviews_submission_id_idx` ON `human_reviews` (`submission_id`);--> statement-breakpoint
CREATE TABLE `judge_results` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`judge_index` integer NOT NULL,
	`result_json` text NOT NULL,
	`usage_json` text NOT NULL,
	`cost_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `lab_submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `judge_results_submission_id_idx` ON `judge_results` (`submission_id`);--> statement-breakpoint
CREATE TABLE `regression_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`attempt_id` text NOT NULL,
	`set_id` text NOT NULL,
	`provider` text NOT NULL,
	`mode` text NOT NULL,
	`prompt` text NOT NULL,
	`result_json` text NOT NULL,
	`usage_json` text NOT NULL,
	`cost_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `lab_attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `regression_runs_owner_email_idx` ON `regression_runs` (`owner_email`);--> statement-breakpoint
CREATE INDEX `regression_runs_attempt_id_idx` ON `regression_runs` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `score_appeals` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolution` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `lab_submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `score_appeals_submission_id_idx` ON `score_appeals` (`submission_id`);--> statement-breakpoint
CREATE INDEX `score_appeals_owner_email_idx` ON `score_appeals` (`owner_email`);