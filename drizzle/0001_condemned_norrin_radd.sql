CREATE TABLE `model_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`response_id` text NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`output_text` text NOT NULL,
	`trace_json` text NOT NULL,
	`usage_json` text NOT NULL,
	`cost_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `lab_attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `model_runs_attempt_id_idx` ON `model_runs` (`attempt_id`);