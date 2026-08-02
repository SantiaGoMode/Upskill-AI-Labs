CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_events_entity_idx` ON `audit_events` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `capability_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`capability_key` text NOT NULL,
	`label` text NOT NULL,
	`band` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`evidence_json` text NOT NULL,
	`earned_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `capability_claims_owner_email_idx` ON `capability_claims` (`owner_email`);--> statement-breakpoint
CREATE TABLE `cohorts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`curriculum_version_id` text NOT NULL,
	`learner_emails_json` text DEFAULT '[]' NOT NULL,
	`workflow_summary_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`curriculum_version_id`) REFERENCES `curriculum_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cohorts_owner_email_idx` ON `cohorts` (`owner_email`);--> statement-breakpoint
CREATE TABLE `curriculum_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`workflow_map_id` text NOT NULL,
	`recipe_version` text NOT NULL,
	`route_json` text NOT NULL,
	`adaptations_json` text NOT NULL,
	`estimated_minutes` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workflow_map_id`) REFERENCES `workflow_maps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `curriculum_instances_owner_email_idx` ON `curriculum_instances` (`owner_email`);--> statement-breakpoint
CREATE TABLE `curriculum_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`content_json` text NOT NULL,
	`change_summary` text DEFAULT '' NOT NULL,
	`reviewer_email` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `curriculum_versions_status_idx` ON `curriculum_versions` (`status`);--> statement-breakpoint
CREATE TABLE `policy_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`allowed_intake_tier` text DEFAULT 'T1' NOT NULL,
	`data_classes_json` text NOT NULL,
	`approved_models_json` text NOT NULL,
	`prohibited_uses_json` text NOT NULL,
	`disclosure_rules_json` text NOT NULL,
	`human_review_rules_json` text NOT NULL,
	`prompt_retention_days` integer DEFAULT 90 NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `policy_profiles_status_idx` ON `policy_profiles` (`status`);--> statement-breakpoint
CREATE TABLE `redaction_experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`workflow_map_id` text NOT NULL,
	`tier` text NOT NULL,
	`transfer_score` integer,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`measured_at` text,
	FOREIGN KEY (`workflow_map_id`) REFERENCES `workflow_maps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `redaction_experiments_tier_idx` ON `redaction_experiments` (`tier`);--> statement-breakpoint
CREATE TABLE `workflow_baselines` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`workflow_id` text NOT NULL,
	`workflow_name` text NOT NULL,
	`metric_name` text NOT NULL,
	`unit` text NOT NULL,
	`baseline_value` text NOT NULL,
	`target_value` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`measured_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workflow_baselines_owner_email_idx` ON `workflow_baselines` (`owner_email`);--> statement-breakpoint
CREATE TABLE `workflow_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`role_description` text NOT NULL,
	`intake_tier` text NOT NULL,
	`industry` text NOT NULL,
	`seniority` text NOT NULL,
	`artifact_shapes_json` text DEFAULT '[]' NOT NULL,
	`workflows_json` text DEFAULT '[]' NOT NULL,
	`priority_workflow_ids_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workflow_maps_owner_email_idx` ON `workflow_maps` (`owner_email`);--> statement-breakpoint
CREATE TABLE `workflow_measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`baseline_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`value` text NOT NULL,
	`source_type` text NOT NULL,
	`reflection` text NOT NULL,
	`measured_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`baseline_id`) REFERENCES `workflow_baselines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workflow_measurements_baseline_id_idx` ON `workflow_measurements` (`baseline_id`);