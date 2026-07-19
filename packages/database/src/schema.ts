import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core'

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
