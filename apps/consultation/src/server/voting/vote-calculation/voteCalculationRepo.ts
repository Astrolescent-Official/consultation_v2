import type { AccountAddress } from '@radix-effects/shared'
import BigNumber from 'bignumber.js'
import { Effect } from 'effect'
import type { EntityId, EntityType } from 'shared/governance/brandedTypes'
import { GovernanceConfig } from 'shared/governance/config'
import { all, first, VoteDatabase } from '../db/d1'
import { canonicalDecimal, decimalSortKey } from '../db/exactDecimal'
import { guardedBatch } from '../pollLease'

export type AccountVoteRecord = {
  readonly accountAddress: AccountAddress
  readonly vote: string
  readonly votePower: string
}

type StateRow = {
  readonly id: number
  readonly lastVoteCount: number
  readonly resultsComputed: number
}

type VoteRow = {
  readonly vote: string
  readonly votePower: string
}

type AccountVoteRow = VoteRow & {
  readonly accountAddress: AccountAddress
}

const PARAMETER_CHUNK_SIZE = 90
const ACCOUNT_INSERT_CHUNK_SIZE = 20
const RESULT_INSERT_CHUNK_SIZE = 30
const COMPONENT_CACHE_BACKFILL_KEY_PREFIX = 'vote_cache_component_backfill'

const chunksOf = <A>(values: ReadonlyArray<A>, size: number) => {
  const chunks: Array<ReadonlyArray<A>> = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

const placeholders = (count: number) => Array(count).fill('?').join(', ')

export class VoteCalculationRepo extends Effect.Service<VoteCalculationRepo>()(
  'VoteCalculationRepo',
  {
    effect: Effect.gen(function* () {
      const database = yield* VoteDatabase
      const governanceConfig = yield* GovernanceConfig
      const governanceComponentAddress = governanceConfig.componentAddress
      const componentCacheBackfillKey = `${COMPONENT_CACHE_BACKFILL_KEY_PREFIX}:${governanceComponentAddress}`

      const getOrCreateState = (
        type: 'temperature_check' | 'proposal',
        entityId: number
      ) =>
        Effect.gen(function* () {
          yield* guardedBatch(database, 'create vote calculation state', [
            database
              .prepare(
                `INSERT INTO vote_calculation_state (
                   governance_component_address,
                   type,
                   entity_id,
                   last_vote_count
                 ) VALUES (?, ?, ?, 0)
                 ON CONFLICT(governance_component_address, type, entity_id) DO NOTHING`
              )
              .bind(governanceComponentAddress, type, entityId)
          ]).pipe(Effect.orDie)

          const row = yield* first<StateRow>(
            'read vote calculation state',
            database
              .prepare(
                `SELECT
                   id,
                   last_vote_count AS lastVoteCount,
                   results_computed AS resultsComputed
                 FROM vote_calculation_state
                 WHERE governance_component_address = ?
                   AND type = ?
                   AND entity_id = ?`
              )
              .bind(governanceComponentAddress, type, entityId)
          ).pipe(Effect.orDie)

          if (row === null) {
            return yield* Effect.die(
              'Expected vote calculation state after creating it'
            )
          }
          return row
        })

      const getComponentCacheBackfillProgress = () =>
        first<{ value: string }>(
          'read component cache backfill configuration',
          database
            .prepare(`SELECT value FROM config WHERE key = ?`)
            .bind(componentCacheBackfillKey)
        ).pipe(
          Effect.map((row) => {
            if (row?.value === 'complete') return null
            const progress = Number(row?.value ?? 0)
            return Number.isSafeInteger(progress) && progress >= 0
              ? progress
              : 0
          }),
          Effect.orDie
        )

      const setComponentCacheBackfillProgress = (
        progress: number | 'complete'
      ) =>
        guardedBatch(database, 'update component cache backfill progress', [
          database
            .prepare(
              `INSERT INTO config (key, value)
               VALUES (?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value`
            )
            .bind(componentCacheBackfillKey, String(progress))
        ]).pipe(Effect.orDie)

      const initializeComponentCache = (
        entities: ReadonlyArray<{
          readonly type: 'temperature_check' | 'proposal'
          readonly entityId: number
          readonly voteCount: number
        }>
      ) => {
        if (entities.length === 0) return Effect.void

        return guardedBatch(database, 'initialize component vote cache', [
          database
            .prepare(
              `INSERT INTO vote_calculation_state (
                 governance_component_address,
                 type,
                 entity_id,
                 last_vote_count,
                 results_computed
               )
               SELECT
                 ?,
                 json_extract(value, '$.type'),
                 CAST(json_extract(value, '$.entityId') AS INTEGER),
                 0,
                 CASE
                   WHEN CAST(json_extract(value, '$.voteCount') AS INTEGER) = 0
                   THEN 1
                   ELSE 0
                 END
               FROM json_each(?)
               WHERE true
               ON CONFLICT(governance_component_address, type, entity_id)
               DO UPDATE SET results_computed = CASE
                 WHEN excluded.results_computed = 1 THEN 1
                 ELSE vote_calculation_state.results_computed
               END`
            )
            .bind(governanceComponentAddress, JSON.stringify(entities))
        ]).pipe(Effect.orDie)
      }

      const markStateComputed = (stateId: number) =>
        guardedBatch(database, 'mark vote calculation state computed', [
          database
            .prepare(
              `UPDATE vote_calculation_state
               SET results_computed = 1
               WHERE id = ?
                 AND governance_component_address = ?`
            )
            .bind(stateId, governanceComponentAddress)
        ]).pipe(Effect.orDie)

      const getAccountVotesByAddresses = (
        stateId: number,
        accountAddresses: ReadonlyArray<string>
      ) =>
        Effect.gen(function* () {
          if (accountAddresses.length === 0) return []

          const uniqueAddresses = [...new Set(accountAddresses)]
          const pages = yield* Effect.forEach(
            chunksOf(uniqueAddresses, PARAMETER_CHUNK_SIZE),
            (addressChunk) =>
              all<AccountVoteRow>(
                'read account votes by address',
                database
                  .prepare(
                    `SELECT
                       account_address AS accountAddress,
                       vote,
                       vote_power AS votePower
                     FROM vote_calculation_account_votes
                     WHERE state_id = ?
                       AND account_address IN (${placeholders(addressChunk.length)})`
                  )
                  .bind(stateId, ...addressChunk)
              ).pipe(Effect.orDie),
            { concurrency: 1 }
          )

          return pages.flat()
        })

      const getResultsByEntity = (type: string, entityId: number) =>
        Effect.gen(function* () {
          const state = yield* first<StateRow>(
            'read vote calculation state for results',
            database
              .prepare(
                `SELECT
                   id,
                   last_vote_count AS lastVoteCount,
                   results_computed AS resultsComputed
                 FROM vote_calculation_state
                 WHERE governance_component_address = ?
                   AND type = ?
                   AND entity_id = ?`
              )
              .bind(governanceComponentAddress, type, entityId)
          ).pipe(Effect.orDie)
          if (state === null || state.resultsComputed !== 1) {
            const results: ReadonlyArray<VoteRow> = []
            return {
              cacheAvailable: false,
              results
            }
          }

          const results = yield* all<VoteRow>(
            'read vote results',
            database
              .prepare(
                `SELECT vote, vote_power AS votePower
                 FROM vote_calculation_results
                 WHERE state_id = ?
                 ORDER BY vote ASC`
              )
              .bind(state.id)
          ).pipe(Effect.orDie)
          return { cacheAvailable: true, results }
        })

      const commitVoteResults = (params: {
        stateId: number
        type: EntityType
        entityId: EntityId
        lastVoteCount: number
        results: ReadonlyArray<VoteRow>
        accountVotes: ReadonlyArray<AccountVoteRecord>
        revoteRemovals: ReadonlyArray<{
          accountAddress: AccountAddress
          oldVotes: ReadonlyArray<VoteRow>
        }>
      }) =>
        Effect.gen(function* () {
          const existingResults = yield* all<VoteRow>(
            'read current vote aggregates',
            database
              .prepare(
                `SELECT vote, vote_power AS votePower
                 FROM vote_calculation_results
                 WHERE state_id = ?`
              )
              .bind(params.stateId)
          ).pipe(Effect.orDie)

          const finalResults = new Map(
            existingResults.map((row) => [
              row.vote,
              new BigNumber(row.votePower)
            ])
          )
          const applyDelta = (vote: string, delta: BigNumber) => {
            const next = (finalResults.get(vote) ?? new BigNumber(0)).plus(
              delta
            )
            if (!next.isFinite() || next.isNegative()) {
              throw new RangeError(`Invalid aggregate vote power for ${vote}`)
            }
            finalResults.set(vote, next)
          }

          for (const removal of params.revoteRemovals) {
            for (const oldVote of removal.oldVotes) {
              applyDelta(
                oldVote.vote,
                new BigNumber(oldVote.votePower).negated()
              )
            }
          }
          for (const result of params.results) {
            applyDelta(result.vote, new BigNumber(result.votePower))
          }

          const statements: Array<D1PreparedStatement> = []
          const removedAccounts = [
            ...new Set(params.revoteRemovals.map((item) => item.accountAddress))
          ]
          for (const addressChunk of chunksOf(
            removedAccounts,
            PARAMETER_CHUNK_SIZE
          )) {
            statements.push(
              database
                .prepare(
                  `DELETE FROM vote_calculation_account_votes
                   WHERE state_id = ?
                     AND account_address IN (${placeholders(addressChunk.length)})`
                )
                .bind(params.stateId, ...addressChunk)
            )
          }

          for (const accountChunk of chunksOf(
            params.accountVotes,
            ACCOUNT_INSERT_CHUNK_SIZE
          )) {
            const values = accountChunk.flatMap((vote) => {
              const votePower = canonicalDecimal(vote.votePower)
              return [
                params.stateId,
                vote.accountAddress,
                vote.vote,
                votePower,
                decimalSortKey(votePower)
              ]
            })
            statements.push(
              database
                .prepare(
                  `INSERT INTO vote_calculation_account_votes (
                     state_id,
                     account_address,
                     vote,
                     vote_power,
                     vote_power_sort_key
                   ) VALUES ${accountChunk.map(() => '(?, ?, ?, ?, ?)').join(', ')}
                   ON CONFLICT(state_id, account_address, vote) DO UPDATE SET
                     vote_power = excluded.vote_power,
                     vote_power_sort_key = excluded.vote_power_sort_key`
                )
                .bind(...values)
            )
          }

          const resultRows = [...finalResults].map(([vote, votePower]) => ({
            vote,
            votePower: canonicalDecimal(votePower.toFixed())
          }))
          for (const resultChunk of chunksOf(
            resultRows,
            RESULT_INSERT_CHUNK_SIZE
          )) {
            const values = resultChunk.flatMap((result) => [
              params.stateId,
              result.vote,
              result.votePower
            ])
            statements.push(
              database
                .prepare(
                  `INSERT INTO vote_calculation_results (state_id, vote, vote_power)
                   VALUES ${resultChunk.map(() => '(?, ?, ?)').join(', ')}
                   ON CONFLICT(state_id, vote) DO UPDATE SET
                     vote_power = excluded.vote_power`
                )
                .bind(...values)
            )
          }

          statements.push(
            database
              .prepare(
                `UPDATE vote_calculation_state
                 SET last_vote_count = ?,
                     results_computed = 1
                 WHERE id = ?
                   AND governance_component_address = ?
                   AND type = ?
                   AND entity_id = ?`
              )
              .bind(
                params.lastVoteCount,
                params.stateId,
                governanceComponentAddress,
                params.type,
                params.entityId
              )
          )

          yield* guardedBatch(database, 'commit vote results', statements).pipe(
            Effect.orDie
          )
        })

      const getAccountVotesByEntity = (
        type: string,
        entityId: number,
        options?: { limit?: number; offset?: number }
      ) => {
        const limit = Math.min(Math.max(options?.limit ?? 500, 1), 500)
        const offset = Math.max(options?.offset ?? 0, 0)

        return all<AccountVoteRow>(
          'read account votes',
          database
            .prepare(
              `SELECT
                 av.account_address AS accountAddress,
                 av.vote AS vote,
                 av.vote_power AS votePower
               FROM vote_calculation_account_votes av
               INNER JOIN vote_calculation_state s ON av.state_id = s.id
               WHERE s.governance_component_address = ?
                 AND s.type = ?
                 AND s.entity_id = ?
               ORDER BY
                 av.vote_power_sort_key DESC,
                 av.account_address ASC,
                 av.vote ASC
               LIMIT ? OFFSET ?`
            )
            .bind(governanceComponentAddress, type, entityId, limit, offset)
        ).pipe(Effect.orDie)
      }

      return {
        getOrCreateState,
        getComponentCacheBackfillProgress,
        setComponentCacheBackfillProgress,
        initializeComponentCache,
        markStateComputed,
        commitVoteResults,
        getResultsByEntity,
        getAccountVotesByEntity,
        getAccountVotesByAddresses
      } as const
    })
  }
) {}
