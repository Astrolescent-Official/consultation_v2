CREATE TABLE "mj_account_ballot" (
	"election_id" integer NOT NULL,
	"round" smallint NOT NULL,
	"account_address" varchar(255) NOT NULL,
	"vote_id" bigint NOT NULL,
	"grades" jsonb NOT NULL,
	"voting_power" numeric NOT NULL,
	"cast_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mj_account_ballot_election_id_round_account_address_pk" PRIMARY KEY("election_id","round","account_address"),
	CONSTRAINT "mj_account_ballot_round" CHECK ("mj_account_ballot"."round" IN (1, 2)),
	CONSTRAINT "mj_account_ballot_vote_id_non_negative" CHECK ("mj_account_ballot"."vote_id" >= 0),
	CONSTRAINT "mj_account_ballot_power_positive" CHECK ("mj_account_ballot"."voting_power"::numeric > 0)
);
--> statement-breakpoint
CREATE TABLE "mj_candidate" (
	"election_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"reference" varchar(255) NOT NULL,
	"display_name" text NOT NULL,
	"description" text NOT NULL,
	"links" jsonb NOT NULL,
	"display_order" integer NOT NULL,
	CONSTRAINT "mj_candidate_election_id_candidate_id_pk" PRIMARY KEY("election_id","candidate_id"),
	CONSTRAINT "mj_candidate_reference_unique" UNIQUE("election_id","reference"),
	CONSTRAINT "mj_candidate_display_order_unique" UNIQUE("election_id","display_order"),
	CONSTRAINT "mj_candidate_id_non_negative" CHECK ("mj_candidate"."candidate_id" >= 0),
	CONSTRAINT "mj_candidate_display_order_non_negative" CHECK ("mj_candidate"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mj_election" (
	"id" integer PRIMARY KEY NOT NULL,
	"temperature_check_id" integer NOT NULL,
	"role_id" varchar(255) NOT NULL,
	"title" text NOT NULL,
	"short_description" text NOT NULL,
	"description" text NOT NULL,
	"seat_count" integer NOT NULL,
	"review_start" timestamp with time zone NOT NULL,
	"review_end" timestamp with time zone NOT NULL,
	"parameter_set_id" varchar(64) NOT NULL,
	"parameter_set_version" integer NOT NULL,
	"reserve_list_days" integer NOT NULL,
	"status" varchar(32) NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mj_election_temperature_check_unique" UNIQUE("temperature_check_id"),
	CONSTRAINT "mj_election_seat_count_positive" CHECK ("mj_election"."seat_count" > 0),
	CONSTRAINT "mj_election_parameter_version_positive" CHECK ("mj_election"."parameter_set_version" > 0),
	CONSTRAINT "mj_election_reserve_days_non_negative" CHECK ("mj_election"."reserve_list_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mj_grade_histogram" (
	"election_id" integer NOT NULL,
	"round" smallint NOT NULL,
	"candidate_id" integer NOT NULL,
	"grade" smallint NOT NULL,
	"voting_power" numeric DEFAULT '0' NOT NULL,
	CONSTRAINT "mj_grade_histogram_election_id_round_candidate_id_grade_pk" PRIMARY KEY("election_id","round","candidate_id","grade"),
	CONSTRAINT "mj_grade_histogram_round" CHECK ("mj_grade_histogram"."round" IN (1, 2)),
	CONSTRAINT "mj_grade_histogram_grade" CHECK ("mj_grade_histogram"."grade" BETWEEN 0 AND 4),
	CONSTRAINT "mj_grade_histogram_power_non_negative" CHECK ("mj_grade_histogram"."voting_power"::numeric >= 0)
);
--> statement-breakpoint
CREATE TABLE "mj_result" (
	"election_id" integer NOT NULL,
	"round" smallint NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"total_voting_power" numeric NOT NULL,
	"quorum_xrd" numeric NOT NULL,
	"quorum_met" boolean NOT NULL,
	"minimum_median_grade" smallint NOT NULL,
	"candidate_results" jsonb NOT NULL,
	"seated_candidate_ids" jsonb NOT NULL,
	"reserve_candidate_ids" jsonb NOT NULL,
	"reserve_expires_at" timestamp with time zone,
	"referred_seats" integer NOT NULL,
	"tie_break_iterations" integer NOT NULL,
	"unresolved_candidate_ids" jsonb NOT NULL,
	"status" varchar(32) NOT NULL,
	CONSTRAINT "mj_result_election_id_round_pk" PRIMARY KEY("election_id","round"),
	CONSTRAINT "mj_result_round" CHECK ("mj_result"."round" IN (1, 2)),
	CONSTRAINT "mj_result_total_power_non_negative" CHECK ("mj_result"."total_voting_power"::numeric >= 0),
	CONSTRAINT "mj_result_quorum_positive" CHECK ("mj_result"."quorum_xrd"::numeric > 0),
	CONSTRAINT "mj_result_minimum_grade" CHECK ("mj_result"."minimum_median_grade" BETWEEN 0 AND 4),
	CONSTRAINT "mj_result_referred_seats_non_negative" CHECK ("mj_result"."referred_seats" >= 0),
	CONSTRAINT "mj_result_tie_iterations_non_negative" CHECK ("mj_result"."tie_break_iterations" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mj_round" (
	"election_id" integer NOT NULL,
	"round" smallint NOT NULL,
	"snapshot_at" timestamp with time zone NOT NULL,
	"snapshot_state_version" bigint,
	"voting_start" timestamp with time zone NOT NULL,
	"voting_end" timestamp with time zone NOT NULL,
	"quorum_xrd" numeric NOT NULL,
	"minimum_median_grade" smallint NOT NULL,
	"votes_kvs_address" varchar(255) NOT NULL,
	"voters_kvs_address" varchar(255) NOT NULL,
	"last_vote_count" bigint DEFAULT 0 NOT NULL,
	"status" varchar(32) NOT NULL,
	CONSTRAINT "mj_round_election_id_round_pk" PRIMARY KEY("election_id","round"),
	CONSTRAINT "mj_round_number" CHECK ("mj_round"."round" IN (1, 2)),
	CONSTRAINT "mj_round_quorum_positive" CHECK ("mj_round"."quorum_xrd"::numeric > 0),
	CONSTRAINT "mj_round_minimum_grade" CHECK ("mj_round"."minimum_median_grade" BETWEEN 0 AND 4),
	CONSTRAINT "mj_round_last_vote_count_non_negative" CHECK ("mj_round"."last_vote_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "mj_account_ballot" ADD CONSTRAINT "mj_account_ballot_round_fk" FOREIGN KEY ("election_id","round") REFERENCES "public"."mj_round"("election_id","round") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mj_candidate" ADD CONSTRAINT "mj_candidate_election_id_mj_election_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."mj_election"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mj_grade_histogram" ADD CONSTRAINT "mj_grade_histogram_round_fk" FOREIGN KEY ("election_id","round") REFERENCES "public"."mj_round"("election_id","round") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mj_grade_histogram" ADD CONSTRAINT "mj_grade_histogram_candidate_fk" FOREIGN KEY ("election_id","candidate_id") REFERENCES "public"."mj_candidate"("election_id","candidate_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mj_result" ADD CONSTRAINT "mj_result_round_fk" FOREIGN KEY ("election_id","round") REFERENCES "public"."mj_round"("election_id","round") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mj_round" ADD CONSTRAINT "mj_round_election_id_mj_election_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."mj_election"("id") ON DELETE cascade ON UPDATE no action;