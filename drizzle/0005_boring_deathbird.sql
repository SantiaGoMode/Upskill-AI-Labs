CREATE TABLE `cohort_enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`cohort_id` text NOT NULL,
	`learner_email` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`current_lab_id` text DEFAULT 'lab-01' NOT NULL,
	`invited_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`joined_at` text,
	`completed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cohort_enrollments_cohort_idx` ON `cohort_enrollments` (`cohort_id`);--> statement-breakpoint
CREATE INDEX `cohort_enrollments_learner_idx` ON `cohort_enrollments` (`learner_email`);--> statement-breakpoint
CREATE TABLE `cohort_interventions` (
	`id` text PRIMARY KEY NOT NULL,
	`cohort_id` text NOT NULL,
	`learner_email` text NOT NULL,
	`facilitator_email` text NOT NULL,
	`note` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cohort_interventions_cohort_idx` ON `cohort_interventions` (`cohort_id`);--> statement-breakpoint
CREATE TABLE `cohort_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`cohort_id` text NOT NULL,
	`title` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`agenda` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cohort_sessions_cohort_idx` ON `cohort_sessions` (`cohort_id`);--> statement-breakpoint
CREATE TABLE `local_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `local_users`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `local_sessions_user_idx` ON `local_sessions` (`user_email`);--> statement-breakpoint
CREATE TABLE `local_users` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'learner' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `local_users_status_idx` ON `local_users` (`status`);--> statement-breakpoint
CREATE TABLE `organization_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`invite_token` text,
	`invited_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`joined_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `organization_members_org_idx` ON `organization_members` (`organization_id`);--> statement-breakpoint
CREATE INDEX `organization_members_email_idx` ON `organization_members` (`email`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`owner_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `organizations_owner_email_idx` ON `organizations` (`owner_email`);--> statement-breakpoint
ALTER TABLE `cohorts` ADD `organization_id` text;--> statement-breakpoint
ALTER TABLE `cohorts` ADD `starts_at` text;--> statement-breakpoint
ALTER TABLE `cohorts` ADD `ends_at` text;--> statement-breakpoint
ALTER TABLE `cohorts` ADD `archived_at` text;