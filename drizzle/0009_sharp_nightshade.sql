ALTER TABLE `live_room_board_cards` ADD `kind` text DEFAULT 'note' NOT NULL;--> statement-breakpoint
ALTER TABLE `live_room_board_cards` ADD `x` integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE `live_room_board_cards` ADD `y` integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE `live_room_board_cards` ADD `width` integer DEFAULT 220 NOT NULL;--> statement-breakpoint
ALTER TABLE `live_room_board_cards` ADD `height` integer DEFAULT 140 NOT NULL;--> statement-breakpoint
ALTER TABLE `live_room_board_cards` ADD `payload` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `live_room_board_cards` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;