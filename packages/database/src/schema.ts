import { sql } from 'drizzle-orm'
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core'

const bigintText = customType<{
  data: bigint
  driverData: string
}>({
  dataType: () => 'text',
  fromDriver: (value) => BigInt(value),
  toDriver: (value) => value.toString()
})

export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const pollLease = sqliteTable('poll_lease', {
  id: integer('id').primaryKey(),
  owner: text('owner').notNull(),
  expiresAt: integer('expires_at').notNull()
})

export const voteCalculationState = sqliteTable(
  'vote_calculation_state',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(),
    entityId: integer('entity_id').notNull(),
    lastVoteCount: integer('last_vote_count').notNull().default(0)
  },
  (table) => [
    uniqueIndex('vote_calculation_state_type_entity_id_unique').on(
      table.type,
      table.entityId
    )
  ]
)

export const voteCalculationResults = sqliteTable(
  'vote_calculation_results',
  {
    stateId: integer('state_id')
      .notNull()
      .references(() => voteCalculationState.id, { onDelete: 'cascade' }),
    vote: text('vote').notNull(),
    // D1/SQLite NUMERIC values can be coerced to IEEE-754 numbers. Keep the
    // canonical decimal as TEXT and perform all arithmetic with BigNumber.
    votePower: text('vote_power').notNull().default('0')
  },
  (table) => [primaryKey({ columns: [table.stateId, table.vote] })]
)

// Revote support: old rows are deleted before inserting new ones within the same
// transaction in commitVoteResults, so the composite PK works correctly.
export const voteCalculationAccountVotes = sqliteTable(
  'vote_calculation_account_votes',
  {
    stateId: integer('state_id')
      .notNull()
      .references(() => voteCalculationState.id, { onDelete: 'cascade' }),
    accountAddress: text('account_address').notNull(),
    vote: text('vote').notNull(),
    votePower: text('vote_power').notNull().default('0'),
    // Fixed-width lexical representation used only for exact numeric ordering.
    votePowerSortKey: text('vote_power_sort_key').notNull()
  },
  (table) => [
    primaryKey({ columns: [table.stateId, table.accountAddress, table.vote] }),
    index('vote_calculation_account_votes_entity_power_idx').on(
      table.stateId,
      table.votePowerSortKey
    )
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

export const mjElection = sqliteTable(
  'mj_election',
  {
    id: integer('id').primaryKey(),
    temperatureCheckId: integer('temperature_check_id').notNull(),
    roleId: text('role_id').notNull(),
    title: text('title').notNull(),
    shortDescription: text('short_description').notNull(),
    description: text('description').notNull(),
    seatCount: integer('seat_count').notNull(),
    reviewStart: integer('review_start', { mode: 'timestamp_ms' }).notNull(),
    reviewEnd: integer('review_end', { mode: 'timestamp_ms' }).notNull(),
    parameterSetId: text('parameter_set_id').notNull(),
    parameterSetVersion: integer('parameter_set_version').notNull(),
    reserveListDays: integer('reserve_list_days').notNull(),
    status: text('status').notNull(),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [
    uniqueIndex('mj_election_temperature_check_unique').on(
      table.temperatureCheckId
    ),
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

export const mjCandidate = sqliteTable(
  'mj_candidate',
  {
    electionId: integer('election_id')
      .notNull()
      .references(() => mjElection.id, { onDelete: 'cascade' }),
    candidateId: integer('candidate_id').notNull(),
    reference: text('reference').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description').notNull(),
    links: text('links', { mode: 'json' })
      .$type<ReadonlyArray<string>>()
      .notNull(),
    displayOrder: integer('display_order').notNull()
  },
  (table) => [
    primaryKey({ columns: [table.electionId, table.candidateId] }),
    uniqueIndex('mj_candidate_reference_unique').on(
      table.electionId,
      table.reference
    ),
    uniqueIndex('mj_candidate_display_order_unique').on(
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

export const mjRound = sqliteTable(
  'mj_round',
  {
    electionId: integer('election_id')
      .notNull()
      .references(() => mjElection.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    snapshotAt: integer('snapshot_at', { mode: 'timestamp_ms' }).notNull(),
    snapshotStateVersion: bigintText('snapshot_state_version'),
    votingStart: integer('voting_start', { mode: 'timestamp_ms' }).notNull(),
    votingEnd: integer('voting_end', { mode: 'timestamp_ms' }).notNull(),
    quorumXrd: text('quorum_xrd').notNull(),
    minimumMedianGrade: integer('minimum_median_grade').notNull(),
    votesKvsAddress: text('votes_kvs_address').notNull(),
    votersKvsAddress: text('voters_kvs_address').notNull(),
    lastVoteCount: bigintText('last_vote_count').notNull().default(sql`'0'`),
    status: text('status').notNull()
  },
  (table) => [
    primaryKey({ columns: [table.electionId, table.round] }),
    check('mj_round_number', sql`${table.round} IN (1, 2)`),
    check(
      'mj_round_quorum_positive',
      sql`CAST(${table.quorumXrd} AS REAL) > 0`
    ),
    check(
      'mj_round_minimum_grade',
      sql`${table.minimumMedianGrade} BETWEEN 0 AND 4`
    ),
    check(
      'mj_round_last_vote_count_non_negative',
      sql`CAST(${table.lastVoteCount} AS INTEGER) >= 0`
    )
  ]
)

export const mjAccountBallot = sqliteTable(
  'mj_account_ballot',
  {
    electionId: integer('election_id').notNull(),
    round: integer('round').notNull(),
    accountAddress: text('account_address').notNull(),
    voteId: bigintText('vote_id').notNull(),
    grades: text('grades', { mode: 'json' })
      .$type<ReadonlyArray<MajorityJudgmentCandidateGradeJson>>()
      .notNull(),
    votingPower: text('voting_power').notNull(),
    castAt: integer('cast_at', { mode: 'timestamp_ms' }).notNull()
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
    check(
      'mj_account_ballot_vote_id_non_negative',
      sql`CAST(${table.voteId} AS INTEGER) >= 0`
    ),
    check(
      'mj_account_ballot_power_positive',
      sql`CAST(${table.votingPower} AS REAL) > 0`
    )
  ]
)

export const mjGradeHistogram = sqliteTable(
  'mj_grade_histogram',
  {
    electionId: integer('election_id').notNull(),
    round: integer('round').notNull(),
    candidateId: integer('candidate_id').notNull(),
    grade: integer('grade').notNull(),
    votingPower: text('voting_power').notNull().default('0')
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
      sql`CAST(${table.votingPower} AS REAL) >= 0`
    )
  ]
)

export const mjResult = sqliteTable(
  'mj_result',
  {
    electionId: integer('election_id').notNull(),
    round: integer('round').notNull(),
    computedAt: integer('computed_at', { mode: 'timestamp_ms' }).notNull(),
    totalVotingPower: text('total_voting_power').notNull(),
    quorumXrd: text('quorum_xrd').notNull(),
    quorumMet: integer('quorum_met', { mode: 'boolean' }).notNull(),
    minimumMedianGrade: integer('minimum_median_grade').notNull(),
    candidateResults: text('candidate_results', { mode: 'json' })
      .$type<ReadonlyArray<MajorityJudgmentCandidateResultJson>>()
      .notNull(),
    seatedCandidateIds: text('seated_candidate_ids', { mode: 'json' })
      .$type<ReadonlyArray<number>>()
      .notNull(),
    reserveCandidateIds: text('reserve_candidate_ids', { mode: 'json' })
      .$type<ReadonlyArray<number>>()
      .notNull(),
    reserveExpiresAt: integer('reserve_expires_at', { mode: 'timestamp_ms' }),
    referredSeats: integer('referred_seats').notNull(),
    tieBreakIterations: integer('tie_break_iterations').notNull(),
    unresolvedCandidateIds: text('unresolved_candidate_ids', { mode: 'json' })
      .$type<ReadonlyArray<number>>()
      .notNull(),
    status: text('status').notNull()
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
      sql`CAST(${table.totalVotingPower} AS REAL) >= 0`
    ),
    check(
      'mj_result_quorum_positive',
      sql`CAST(${table.quorumXrd} AS REAL) > 0`
    ),
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
