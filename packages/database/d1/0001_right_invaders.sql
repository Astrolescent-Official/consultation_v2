CREATE TABLE `mj_account_ballot` (
	`election_id` integer NOT NULL,
	`round` integer NOT NULL,
	`account_address` text NOT NULL,
	`vote_id` text NOT NULL,
	`grades` text NOT NULL,
	`voting_power` text NOT NULL,
	`cast_at` integer NOT NULL,
	PRIMARY KEY(`election_id`, `round`, `account_address`),
	FOREIGN KEY (`election_id`,`round`) REFERENCES `mj_round`(`election_id`,`round`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mj_account_ballot_round" CHECK("mj_account_ballot"."round" IN (1, 2)),
	CONSTRAINT "mj_account_ballot_vote_id_non_negative" CHECK(CAST("mj_account_ballot"."vote_id" AS INTEGER) >= 0),
	CONSTRAINT "mj_account_ballot_power_positive" CHECK(CAST("mj_account_ballot"."voting_power" AS REAL) > 0)
);
--> statement-breakpoint
CREATE TABLE `mj_candidate` (
	`election_id` integer NOT NULL,
	`candidate_id` integer NOT NULL,
	`reference` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text NOT NULL,
	`links` text NOT NULL,
	`display_order` integer NOT NULL,
	PRIMARY KEY(`election_id`, `candidate_id`),
	FOREIGN KEY (`election_id`) REFERENCES `mj_election`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mj_candidate_id_non_negative" CHECK("mj_candidate"."candidate_id" >= 0),
	CONSTRAINT "mj_candidate_display_order_non_negative" CHECK("mj_candidate"."display_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mj_candidate_reference_unique` ON `mj_candidate` (`election_id`,`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `mj_candidate_display_order_unique` ON `mj_candidate` (`election_id`,`display_order`);--> statement-breakpoint
CREATE TABLE `mj_election` (
	`id` integer PRIMARY KEY NOT NULL,
	`temperature_check_id` integer NOT NULL,
	`role_id` text NOT NULL,
	`title` text NOT NULL,
	`short_description` text NOT NULL,
	`description` text NOT NULL,
	`seat_count` integer NOT NULL,
	`review_start` integer NOT NULL,
	`review_end` integer NOT NULL,
	`parameter_set_id` text NOT NULL,
	`parameter_set_version` integer NOT NULL,
	`reserve_list_days` integer NOT NULL,
	`status` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "mj_election_seat_count_positive" CHECK("mj_election"."seat_count" > 0),
	CONSTRAINT "mj_election_parameter_version_positive" CHECK("mj_election"."parameter_set_version" > 0),
	CONSTRAINT "mj_election_reserve_days_non_negative" CHECK("mj_election"."reserve_list_days" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mj_election_temperature_check_unique` ON `mj_election` (`temperature_check_id`);--> statement-breakpoint
CREATE TABLE `mj_grade_histogram` (
	`election_id` integer NOT NULL,
	`round` integer NOT NULL,
	`candidate_id` integer NOT NULL,
	`grade` integer NOT NULL,
	`voting_power` text DEFAULT '0' NOT NULL,
	PRIMARY KEY(`election_id`, `round`, `candidate_id`, `grade`),
	FOREIGN KEY (`election_id`,`round`) REFERENCES `mj_round`(`election_id`,`round`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`election_id`,`candidate_id`) REFERENCES `mj_candidate`(`election_id`,`candidate_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mj_grade_histogram_round" CHECK("mj_grade_histogram"."round" IN (1, 2)),
	CONSTRAINT "mj_grade_histogram_grade" CHECK("mj_grade_histogram"."grade" BETWEEN 0 AND 4),
	CONSTRAINT "mj_grade_histogram_power_non_negative" CHECK(CAST("mj_grade_histogram"."voting_power" AS REAL) >= 0)
);
--> statement-breakpoint
CREATE TABLE `mj_result` (
	`election_id` integer NOT NULL,
	`round` integer NOT NULL,
	`computed_at` integer NOT NULL,
	`total_voting_power` text NOT NULL,
	`quorum_xrd` text NOT NULL,
	`quorum_met` integer NOT NULL,
	`minimum_median_grade` integer NOT NULL,
	`candidate_results` text NOT NULL,
	`seated_candidate_ids` text NOT NULL,
	`reserve_candidate_ids` text NOT NULL,
	`reserve_expires_at` integer,
	`referred_seats` integer NOT NULL,
	`tie_break_iterations` integer NOT NULL,
	`unresolved_candidate_ids` text NOT NULL,
	`status` text NOT NULL,
	PRIMARY KEY(`election_id`, `round`),
	FOREIGN KEY (`election_id`,`round`) REFERENCES `mj_round`(`election_id`,`round`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mj_result_round" CHECK("mj_result"."round" IN (1, 2)),
	CONSTRAINT "mj_result_total_power_non_negative" CHECK(CAST("mj_result"."total_voting_power" AS REAL) >= 0),
	CONSTRAINT "mj_result_quorum_positive" CHECK(CAST("mj_result"."quorum_xrd" AS REAL) > 0),
	CONSTRAINT "mj_result_minimum_grade" CHECK("mj_result"."minimum_median_grade" BETWEEN 0 AND 4),
	CONSTRAINT "mj_result_referred_seats_non_negative" CHECK("mj_result"."referred_seats" >= 0),
	CONSTRAINT "mj_result_tie_iterations_non_negative" CHECK("mj_result"."tie_break_iterations" >= 0)
);
--> statement-breakpoint
CREATE TABLE `mj_round` (
	`election_id` integer NOT NULL,
	`round` integer NOT NULL,
	`snapshot_at` integer NOT NULL,
	`snapshot_state_version` text,
	`voting_start` integer NOT NULL,
	`voting_end` integer NOT NULL,
	`quorum_xrd` text NOT NULL,
	`minimum_median_grade` integer NOT NULL,
	`votes_kvs_address` text NOT NULL,
	`voters_kvs_address` text NOT NULL,
	`last_vote_count` text DEFAULT '0' NOT NULL,
	`status` text NOT NULL,
	PRIMARY KEY(`election_id`, `round`),
	FOREIGN KEY (`election_id`) REFERENCES `mj_election`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mj_round_number" CHECK("mj_round"."round" IN (1, 2)),
	CONSTRAINT "mj_round_quorum_positive" CHECK(CAST("mj_round"."quorum_xrd" AS REAL) > 0),
	CONSTRAINT "mj_round_minimum_grade" CHECK("mj_round"."minimum_median_grade" BETWEEN 0 AND 4),
	CONSTRAINT "mj_round_last_vote_count_non_negative" CHECK(CAST("mj_round"."last_vote_count" AS INTEGER) >= 0)
);
