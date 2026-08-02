ALTER TABLE `lab_attempts` ADD `owner_email` text DEFAULT 'legacy-local@upskill.invalid' NOT NULL;--> statement-breakpoint
CREATE INDEX `lab_attempts_owner_email_idx` ON `lab_attempts` (`owner_email`);
