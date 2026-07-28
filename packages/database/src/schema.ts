import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  varchar
} from 'drizzle-orm/pg-core'

export const config = pgTable('config', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: text('value').notNull()
})

export const voteCalculationState = pgTable(
  'vote_calculation_state',
  {
    id: serial('id').primaryKey(),
    type: varchar('type', { length: 50 }).notNull(),
    entityId: integer('entity_id').notNull(),
    lastVoteCount: integer('last_vote_count').notNull().default(0)
  },
  (table) => [unique().on(table.type, table.entityId)]
)

export const voteCalculationResults = pgTable(
  'vote_calculation_results',
  {
    stateId: integer('state_id')
      .notNull()
      .references(() => voteCalculationState.id, { onDelete: 'cascade' }),
    vote: varchar('vote', { length: 255 }).notNull(),
    votePower: numeric('vote_power').notNull().default('0')
  },
  (table) => [primaryKey({ columns: [table.stateId, table.vote] })]
)

// Revote support: old rows are deleted before inserting new ones within the same
// transaction in commitVoteResults, so the composite PK works correctly.
export const voteCalculationAccountVotes = pgTable(
  'vote_calculation_account_votes',
  {
    stateId: integer('state_id')
      .notNull()
      .references(() => voteCalculationState.id, { onDelete: 'cascade' }),
    accountAddress: varchar('account_address', { length: 255 }).notNull(),
    vote: varchar('vote', { length: 255 }).notNull(),
    votePower: numeric('vote_power').notNull().default('0')
  },
  (table) => [
    primaryKey({ columns: [table.stateId, table.accountAddress, table.vote] })
  ]
)

export type MajorityJudgmentCandidateGradeJson = {
  readonly candidateId: number
  readonly grade: 0 | 1 | 2 | 3 | 4
}

export type MajorityJudgmentCandidateResultJson = {
  readonly candidateId: number
  readonly histogram: readonly [string, string, string, string, string]
  readonly majorityGrade: 0 | 1 | 2 | 3 | 4 | null
  readonly finalMajorityGrade: 0 | 1 | 2 | 3 | 4 | null
  readonly electable: boolean
  readonly rank: number | null
  readonly outcome: 'SEATED' | 'RESERVE' | 'NOT_ELECTABLE' | 'UNRESOLVED'
}

export const mjElection = pgTable(
  'mj_election',
  {
    id: integer('id').primaryKey(),
    temperatureCheckId: integer('temperature_check_id').notNull(),
    roleId: varchar('role_id', { length: 255 }).notNull(),
    title: text('title').notNull(),
    shortDescription: text('short_description').notNull(),
    description: text('description').notNull(),
    seatCount: integer('seat_count').notNull(),
    reviewStart: timestamp('review_start', {
      withTimezone: true,
      mode: 'date'
    }).notNull(),
    reviewEnd: timestamp('review_end', {
      withTimezone: true,
      mode: 'date'
    }).notNull(),
    parameterSetId: varchar('parameter_set_id', { length: 64 }).notNull(),
    parameterSetVersion: integer('parameter_set_version').notNull(),
    reserveListDays: integer('reserve_list_days').notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    hidden: boolean('hidden').notNull().default(false),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date'
    }).notNull()
  },
  (table) => [
    unique('mj_election_temperature_check_unique').on(table.temperatureCheckId),
    check('mj_election_seat_count_positive', sql`${table.seatCount} > 0`),
    check(
      'mj_election_parameter_version_positive',
      sql`${table.parameterSetVersion} > 0`
    ),
    check(
      'mj_election_reserve_days_non_negative',
      sql`${table.reserveListDays} >= 0`
    )
  ]
)

export const mjCandidate = pgTable(
  'mj_candidate',
  {
    electionId: integer('election_id')
      .notNull()
      .references(() => mjElection.id, { onDelete: 'cascade' }),
    candidateId: integer('candidate_id').notNull(),
    reference: varchar('reference', { length: 255 }).notNull(),
    displayName: text('display_name').notNull(),
    description: text('description').notNull(),
    links: jsonb('links').$type<ReadonlyArray<string>>().notNull(),
    displayOrder: integer('display_order').notNull()
  },
  (table) => [
    primaryKey({ columns: [table.electionId, table.candidateId] }),
    unique('mj_candidate_reference_unique').on(
      table.electionId,
      table.reference
    ),
    unique('mj_candidate_display_order_unique').on(
      table.electionId,
      table.displayOrder
    ),
    check('mj_candidate_id_non_negative', sql`${table.candidateId} >= 0`),
    check(
      'mj_candidate_display_order_non_negative',
      sql`${table.displayOrder} >= 0`
    )
  ]
)

export const mjRound = pgTable(
  'mj_round',
  {
    electionId: integer('election_id')
      .notNull()
      .references(() => mjElection.id, { onDelete: 'cascade' }),
    round: smallint('round').notNull(),
    snapshotAt: timestamp('snapshot_at', {
      withTimezone: true,
      mode: 'date'
    }).notNull(),
    snapshotStateVersion: bigint('snapshot_state_version', {
      mode: 'bigint'
    }),
    votingStart: timestamp('voting_start', {
      withTimezone: true,
      mode: 'date'
    }).notNull(),
    votingEnd: timestamp('voting_end', {
      withTimezone: true,
      mode: 'date'
    }).notNull(),
    quorumXrd: numeric('quorum_xrd').notNull(),
    minimumMedianGrade: smallint('minimum_median_grade').notNull(),
    votesKvsAddress: varchar('votes_kvs_address', { length: 255 }).notNull(),
    votersKvsAddress: varchar('voters_kvs_address', { length: 255 }).notNull(),
    lastVoteCount: bigint('last_vote_count', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    status: varchar('status', { length: 32 }).notNull()
  },
  (table) => [
    primaryKey({ columns: [table.electionId, table.round] }),
    check('mj_round_number', sql`${table.round} IN (1, 2)`),
    check('mj_round_quorum_positive', sql`${table.quorumXrd}::numeric > 0`),
    check(
      'mj_round_minimum_grade',
      sql`${table.minimumMedianGrade} BETWEEN 0 AND 4`
    ),
    check(
      'mj_round_last_vote_count_non_negative',
      sql`${table.lastVoteCount} >= 0`
    )
  ]
)

export const mjAccountBallot = pgTable(
  'mj_account_ballot',
  {
    electionId: integer('election_id').notNull(),
    round: smallint('round').notNull(),
    accountAddress: varchar('account_address', { length: 255 }).notNull(),
    voteId: bigint('vote_id', { mode: 'bigint' }).notNull(),
    grades: jsonb('grades')
      .$type<ReadonlyArray<MajorityJudgmentCandidateGradeJson>>()
      .notNull(),
    votingPower: numeric('voting_power').notNull(),
    castAt: timestamp('cast_at', {
      withTimezone: true,
      mode: 'date'
    }).notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.electionId, table.round, table.accountAddress]
    }),
    foreignKey({
      columns: [table.electionId, table.round],
      foreignColumns: [mjRound.electionId, mjRound.round],
      name: 'mj_account_ballot_round_fk'
    }).onDelete('cascade'),
    check('mj_account_ballot_round', sql`${table.round} IN (1, 2)`),
    check('mj_account_ballot_vote_id_non_negative', sql`${table.voteId} >= 0`),
    check(
      'mj_account_ballot_power_positive',
      sql`${table.votingPower}::numeric > 0`
    )
  ]
)

export const mjGradeHistogram = pgTable(
  'mj_grade_histogram',
  {
    electionId: integer('election_id').notNull(),
    round: smallint('round').notNull(),
    candidateId: integer('candidate_id').notNull(),
    grade: smallint('grade').notNull(),
    votingPower: numeric('voting_power').notNull().default('0')
  },
  (table) => [
    primaryKey({
      columns: [table.electionId, table.round, table.candidateId, table.grade]
    }),
    foreignKey({
      columns: [table.electionId, table.round],
      foreignColumns: [mjRound.electionId, mjRound.round],
      name: 'mj_grade_histogram_round_fk'
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.electionId, table.candidateId],
      foreignColumns: [mjCandidate.electionId, mjCandidate.candidateId],
      name: 'mj_grade_histogram_candidate_fk'
    }).onDelete('cascade'),
    check('mj_grade_histogram_round', sql`${table.round} IN (1, 2)`),
    check('mj_grade_histogram_grade', sql`${table.grade} BETWEEN 0 AND 4`),
    check(
      'mj_grade_histogram_power_non_negative',
      sql`${table.votingPower}::numeric >= 0`
    )
  ]
)

export const mjResult = pgTable(
  'mj_result',
  {
    electionId: integer('election_id').notNull(),
    round: smallint('round').notNull(),
    computedAt: timestamp('computed_at', {
      withTimezone: true,
      mode: 'date'
    }).notNull(),
    totalVotingPower: numeric('total_voting_power').notNull(),
    quorumXrd: numeric('quorum_xrd').notNull(),
    quorumMet: boolean('quorum_met').notNull(),
    minimumMedianGrade: smallint('minimum_median_grade').notNull(),
    candidateResults: jsonb('candidate_results')
      .$type<ReadonlyArray<MajorityJudgmentCandidateResultJson>>()
      .notNull(),
    seatedCandidateIds: jsonb('seated_candidate_ids')
      .$type<ReadonlyArray<number>>()
      .notNull(),
    reserveCandidateIds: jsonb('reserve_candidate_ids')
      .$type<ReadonlyArray<number>>()
      .notNull(),
    reserveExpiresAt: timestamp('reserve_expires_at', {
      withTimezone: true,
      mode: 'date'
    }),
    referredSeats: integer('referred_seats').notNull(),
    tieBreakIterations: integer('tie_break_iterations').notNull(),
    unresolvedCandidateIds: jsonb('unresolved_candidate_ids')
      .$type<ReadonlyArray<number>>()
      .notNull(),
    status: varchar('status', { length: 32 }).notNull()
  },
  (table) => [
    primaryKey({ columns: [table.electionId, table.round] }),
    foreignKey({
      columns: [table.electionId, table.round],
      foreignColumns: [mjRound.electionId, mjRound.round],
      name: 'mj_result_round_fk'
    }).onDelete('cascade'),
    check('mj_result_round', sql`${table.round} IN (1, 2)`),
    check(
      'mj_result_total_power_non_negative',
      sql`${table.totalVotingPower}::numeric >= 0`
    ),
    check('mj_result_quorum_positive', sql`${table.quorumXrd}::numeric > 0`),
    check(
      'mj_result_minimum_grade',
      sql`${table.minimumMedianGrade} BETWEEN 0 AND 4`
    ),
    check(
      'mj_result_referred_seats_non_negative',
      sql`${table.referredSeats} >= 0`
    ),
    check(
      'mj_result_tie_iterations_non_negative',
      sql`${table.tieBreakIterations} >= 0`
    )
  ]
)
