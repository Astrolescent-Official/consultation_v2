ALTER TABLE `mj_election` RENAME COLUMN "review_start" TO "tc_voting_start";--> statement-breakpoint
ALTER TABLE `mj_election` RENAME COLUMN "review_end" TO "tc_voting_end";--> statement-breakpoint
ALTER TABLE `mj_election` ADD `snapshot_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `mj_election` SET `snapshot_at` = `tc_voting_start` WHERE `snapshot_at` = 0;--> statement-breakpoint
ALTER TABLE `mj_election` ADD `tc_quorum_xrd` text NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `mj_election` ADD `tc_approval_threshold` text NOT NULL DEFAULT '0.5';--> statement-breakpoint
ALTER TABLE `mj_election` ADD `tc_outcome` text;--> statement-breakpoint
ALTER TABLE `mj_election` ADD `tc_outcome_recorded_at` integer;
