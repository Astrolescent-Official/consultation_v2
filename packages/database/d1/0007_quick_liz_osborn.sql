ALTER TABLE `mj_election` ADD `grade_quantile_num` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `mj_election` ADD `grade_quantile_den` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `mj_result` ADD `grade_quantile_applied` text DEFAULT '1/2' NOT NULL;