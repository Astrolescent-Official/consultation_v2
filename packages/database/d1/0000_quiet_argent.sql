CREATE TABLE `config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `poll_lease` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vote_calculation_account_votes` (
	`state_id` integer NOT NULL,
	`account_address` text NOT NULL,
	`vote` text NOT NULL,
	`vote_power` text DEFAULT '0' NOT NULL,
	`vote_power_sort_key` text NOT NULL,
	PRIMARY KEY(`state_id`, `account_address`, `vote`),
	FOREIGN KEY (`state_id`) REFERENCES `vote_calculation_state`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vote_calculation_account_votes_entity_power_idx` ON `vote_calculation_account_votes` (`state_id`,`vote_power_sort_key`);--> statement-breakpoint
CREATE TABLE `vote_calculation_results` (
	`state_id` integer NOT NULL,
	`vote` text NOT NULL,
	`vote_power` text DEFAULT '0' NOT NULL,
	PRIMARY KEY(`state_id`, `vote`),
	FOREIGN KEY (`state_id`) REFERENCES `vote_calculation_state`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `vote_calculation_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`last_vote_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vote_calculation_state_type_entity_id_unique` ON `vote_calculation_state` (`type`,`entity_id`);