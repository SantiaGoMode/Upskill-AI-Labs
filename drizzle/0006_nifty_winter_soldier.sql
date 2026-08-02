CREATE TABLE `live_room_board_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`section_key` text NOT NULL,
	`author_email` text NOT NULL,
	`body` text NOT NULL,
	`color` text DEFAULT 'blue' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `live_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `live_room_board_cards_room_idx` ON `live_room_board_cards` (`room_id`);--> statement-breakpoint
CREATE TABLE `live_room_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'present' NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`left_at` text,
	FOREIGN KEY (`room_id`) REFERENCES `live_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `live_room_participants_room_idx` ON `live_room_participants` (`room_id`);--> statement-breakpoint
CREATE INDEX `live_room_participants_user_idx` ON `live_room_participants` (`user_email`);--> statement-breakpoint
CREATE TABLE `live_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`current_lab_id` text DEFAULT 'lab-01' NOT NULL,
	`current_section` text DEFAULT 'Welcome and objectives' NOT NULL,
	`shared_prompt` text DEFAULT '' NOT NULL,
	`opened_by` text NOT NULL,
	`opened_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `cohort_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `live_rooms_session_idx` ON `live_rooms` (`session_id`);