/// <reference types="@cloudflare/vitest-pool-workers" />

import { applyD1Migrations, env, SELF } from 'cloudflare:test'
import * as D1Client from '@effect/sql-d1/D1Client'
import { Effect, Layer } from 'effect'
import { GovernanceConfig } from 'shared/governance/config'
import { beforeEach, describe, expect, it } from 'vitest'
import { VoteDatabaseLive } from './server/voting/db/d1'
import { ORM } from './server/voting/db/orm'
import { MajorityJudgmentFinalizer } from './server/voting/majority-judgment/finalizer'
import {
  type MajorityJudgmentProjectionInput,
  MajorityJudgmentRepo,
  UNPROJECTED_TC_QUORUM_XRD
} from './server/voting/majority-judgment/repo'
import {
  type PollLeaseIdentity,
  withPollLease
} from './server/voting/pollLease'

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[]
  }
}

const repositoryLayer = () =>
  MajorityJudgmentRepo.Default.pipe(
    Layer.provide(ORM.Default),
    Layer.provideMerge(VoteDatabaseLive(env.DB)),
    Layer.provide(D1Client.layer({ db: env.DB })),
    Layer.provide(GovernanceConfig.MainnetLive)
  )

const finalizationLayer = () =>
  MajorityJudgmentFinalizer.Default.pipe(
    Layer.provide(ORM.Default),
    Layer.provideMerge(VoteDatabaseLive(env.DB)),
    Layer.provide(D1Client.layer({ db: env.DB })),
    Layer.provide(GovernanceConfig.MainnetLive)
  )

const lease: PollLeaseIdentity = {
  owner: 'majority-judgment-test',
  durationMs: 60_000
}

const runWithRepository = <A, E>(
  effect: Effect.Effect<A, E, MajorityJudgmentRepo>
) =>
  Effect.runPromise(
    withPollLease(lease, effect).pipe(Effect.provide(repositoryLayer()))
  )

const runWithFinalizer = <A, E>(
  effect: Effect.Effect<A, E, MajorityJudgmentFinalizer>
) =>
  Effect.runPromise(
    withPollLease(lease, effect).pipe(Effect.provide(finalizationLayer()))
  )

const projection = {
  temperatureCheckVoteCount: 0,
  election: {
    id: 7,
    temperatureCheckId: 3,
    roleId: 'rac-member',
    title: 'RAC election',
    shortDescription: 'Elect one member',
    description: 'Candidate profiles',
    seatCount: 1,
    snapshotAt: new Date('2026-06-01T00:00:00.000Z'),
    tcVotingStart: new Date('2026-07-01T00:00:00.000Z'),
    tcVotingEnd: new Date('2026-07-08T00:00:00.000Z'),
    tcQuorumXrd: '50',
    tcApprovalThreshold: '0.5',
    tcOutcome: 'PASSED',
    tcOutcomeRecordedAt: new Date('2026-07-08T00:00:00.000Z'),
    parameterSetId: 'mj-rac',
    parameterSetVersion: 1,
    reserveListDays: 90,
    status: 'LIVE',
    hidden: false,
    createdAt: new Date('2026-06-01T00:00:00.000Z')
  },
  candidates: [
    {
      electionId: 7,
      candidateId: 0,
      reference: 'alice',
      displayName: 'Alice',
      description: 'Alice profile',
      links: ['https://example.com/alice'],
      displayOrder: 0
    },
    {
      electionId: 7,
      candidateId: 1,
      reference: 'bob',
      displayName: 'Bob',
      description: 'Bob profile',
      links: ['https://example.com/bob'],
      displayOrder: 1
    }
  ],
  round: {
    electionId: 7,
    round: 1,
    snapshotAt: new Date('2026-06-01T00:00:00.000Z'),
    snapshotStateVersion: 123n,
    votingStart: new Date('2026-07-08T00:00:00.000Z'),
    votingEnd: new Date('2026-07-15T00:00:00.000Z'),
    quorumXrd: '100',
    minimumMedianGrade: 2,
    votesKvsAddress: 'internal_keyvaluestore_votes',
    votersKvsAddress: 'internal_keyvaluestore_voters',
    lastVoteCount: 0n,
    status: 'LIVE'
  }
} satisfies MajorityJudgmentProjectionInput

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  await env.DB.prepare(
    `INSERT INTO poll_lease (id, owner, expires_at)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at`
  )
    .bind(lease.owner, Date.now() + lease.durationMs)
    .run()
})

describe('D1 majority judgment persistence', () => {
  it('derives gauge evidence for historical removal-era result rows without rewriting rank', async () => {
    await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        yield* repo.projectElection(projection)
        yield* repo.commitCalculation({
          electionId: 7,
          round: 1,
          lastVoteCount: 1n,
          ballots: [],
          histograms: [],
          result: {
            computedAt: new Date('2026-07-15T00:00:00.000Z'),
            totalVotingPower: '10',
            quorumXrd: '100',
            quorumMet: false,
            minimumMedianGrade: 2,
            candidateResults: [],
            seatedCandidateIds: [],
            reserveCandidateIds: [],
            reserveExpiresAt: null,
            referredSeats: 1,
            tieBreakIterations: 3,
            unresolvedCandidateIds: [],
            status: 'LIVE'
          }
        })
      })
    )

    await env.DB.prepare(
      'UPDATE mj_result SET candidate_results = ? WHERE election_id = 7 AND round = 1'
    )
      .bind(
        JSON.stringify([
          {
            candidateId: 0,
            histogram: ['5', '0', '0', '0', '5'],
            majorityGrade: 4,
            finalMajorityGrade: 4,
            electable: true,
            rank: 2,
            outcome: 'RESERVE'
          },
          {
            candidateId: 1,
            histogram: ['4', '0', '5', '0', '1'],
            median: 2,
            powerAbove: '1',
            powerBelow: '4',
            p: '0.1',
            q: '0.4',
            band: 'C',
            electable: true,
            rank: 1,
            tieGroupId: null,
            outcome: 'SEATED'
          }
        ])
      )
      .run()

    const response = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        return yield* repo.getElectionResponse(7)
      })
    )
    expect(response.result?.candidateResults[0]).toMatchObject({
      candidateId: 0,
      qualifyingGrade: 4,
      powerAbove: '0',
      powerBelow: '5',
      p: '0',
      q: '0.5',
      band: 'C',
      rank: 2,
      tieGroupId: null
    })
    expect(response.result?.candidateResults[1]).toMatchObject({
      candidateId: 1,
      qualifyingGrade: 2,
      powerAbove: '1',
      powerBelow: '4',
      p: '0.1',
      q: '0.4',
      band: 'C',
      rank: 1,
      tieGroupId: null
    })
  })

  it('indexes and finalizes the TC gate without requiring a round row', async () => {
    await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        yield* repo.projectElection({
          ...projection,
          election: { ...projection.election, status: 'TC_LIVE' },
          round: undefined
        })
        const awaiting = yield* repo.getElectionsAwaitingTemperatureCheckGate()
        expect(awaiting.map(({ id }) => id)).toContain(7)
        const response = yield* repo.getElectionResponse(7)
        expect(response.currentRound).toBeNull()
        expect(response.rounds).toEqual([])
      })
    )

    const indexes = await env.DB.prepare(
      `PRAGMA index_list('mj_election')`
    ).all<{ name: string }>()
    expect(indexes.results.map(({ name }) => name)).toContain(
      'mj_election_status_idx'
    )

    await runWithFinalizer(
      Effect.gen(function* () {
        const finalizer = yield* MajorityJudgmentFinalizer
        yield* finalizer.finalize({
          stateVersion: 9,
          proposerRoundTimestamp: new Date('2026-07-09T00:00:00.000Z')
        })
      })
    )
    const failed = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        return yield* repo.getElectionResponse(7)
      })
    )
    expect(failed.election.status).toBe('TC_FAILED')
    expect(failed.currentRound).toBeNull()
  })

  it('uses fresh post-gate rows to open a projected round in one drain', async () => {
    await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        yield* repo.projectElection({
          ...projection,
          temperatureCheckVoteCount: 1,
          election: { ...projection.election, status: 'TC_LIVE' },
          round: { ...projection.round, status: 'TC_LIVE' }
        })
      })
    )
    const state = await env.DB.prepare(
      `SELECT id FROM vote_calculation_state
       WHERE type = 'temperature_check' AND entity_id = 3`
    ).first<{ id: number }>()
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE vote_calculation_state
         SET last_vote_count = '1', results_computed = 1
         WHERE id = ?`
      ).bind(state?.id),
      env.DB.prepare(
        `INSERT INTO vote_calculation_results (state_id, vote, vote_power)
         VALUES (?, 'For', '100')`
      ).bind(state?.id)
    ])

    await runWithFinalizer(
      Effect.gen(function* () {
        const finalizer = yield* MajorityJudgmentFinalizer
        yield* finalizer.finalize({
          stateVersion: 10,
          proposerRoundTimestamp: new Date('2026-07-09T00:00:00.000Z')
        })
      })
    )
    const response = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        return yield* repo.getElectionResponse(7)
      })
    )
    expect(response.election.status).toBe('LIVE')
    expect(response.currentRound?.round).toBe('RoundOne')
  })

  it('defers a missing cache, fails an initialized zero-vote tally, and never reopens the TC gate', async () => {
    const tcLiveProjection: MajorityJudgmentProjectionInput = {
      ...projection,
      election: { ...projection.election, status: 'TC_LIVE' },
      round: { ...projection.round, status: 'TC_LIVE' }
    }
    await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        yield* repo.projectElection(tcLiveProjection)
      })
    )

    await env.DB.prepare(
      `DELETE FROM vote_calculation_state
       WHERE type = 'temperature_check' AND entity_id = 3`
    ).run()
    await runWithFinalizer(
      Effect.gen(function* () {
        const finalizer = yield* MajorityJudgmentFinalizer
        yield* finalizer.finalize({
          stateVersion: 10,
          proposerRoundTimestamp: new Date('2026-07-09T00:00:00.000Z')
        })
      })
    )
    const unavailable = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        return yield* repo.getElectionResponse(7)
      })
    )
    expect(unavailable.election.status).toBe('TC_LIVE')
    expect(unavailable.temperatureCheckResult.cacheAvailable).toBe(false)

    await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        yield* repo.projectElection(tcLiveProjection)
      })
    )
    await runWithFinalizer(
      Effect.gen(function* () {
        const finalizer = yield* MajorityJudgmentFinalizer
        yield* finalizer.finalize({
          stateVersion: 11,
          proposerRoundTimestamp: new Date('2026-07-09T00:00:00.000Z')
        })
      })
    )
    const failed = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        return yield* repo.getElectionResponse(7)
      })
    )
    expect(failed.election.status).toBe('TC_FAILED')
    const resultCount = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM mj_result WHERE election_id = 7`
    ).first<{ count: number }>()
    expect(resultCount?.count).toBe(0)

    await env.DB.prepare(
      `UPDATE mj_election SET status = 'LIVE' WHERE id = 7`
    ).run()
    await env.DB.prepare(
      `UPDATE mj_round SET status = 'LIVE' WHERE election_id = 7 AND round = 1`
    ).run()
    await runWithFinalizer(
      Effect.gen(function* () {
        const finalizer = yield* MajorityJudgmentFinalizer
        yield* finalizer.finalize({
          stateVersion: 12,
          proposerRoundTimestamp: new Date('2026-07-10T00:00:00.000Z')
        })
      })
    )
    const live = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        return yield* repo.getElectionResponse(7)
      })
    )
    expect(live.election.status).toBe('LIVE')
  })

  it('keeps a legacy quorum sentinel non-terminal and marks its parameters unprojected', async () => {
    await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        yield* repo.projectElection({
          ...projection,
          election: {
            ...projection.election,
            status: 'TC_LIVE',
            tcQuorumXrd: UNPROJECTED_TC_QUORUM_XRD
          },
          round: { ...projection.round, status: 'TC_LIVE' }
        })
      })
    )

    await runWithFinalizer(
      Effect.gen(function* () {
        const finalizer = yield* MajorityJudgmentFinalizer
        yield* finalizer.finalize({
          stateVersion: 13,
          proposerRoundTimestamp: new Date('2026-07-09T00:00:00.000Z')
        })
      })
    )

    const response = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        return yield* repo.getElectionResponse(7)
      })
    )
    expect(response.election.status).toBe('TC_LIVE')
    expect(response.temperatureCheckResult.cacheAvailable).toBe(true)
    expect(response.temperatureCheckResult.tcParametersProjected).toBe(false)
  })

  it('publishes a superseded Round 1 failure and advances directly to the rerun', async () => {
    await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        yield* repo.projectElection(projection)
        yield* repo.projectRound({
          ...projection.round,
          round: 2,
          votingStart: new Date('2026-07-20T00:00:00.000Z'),
          votingEnd: new Date('2026-08-03T00:00:00.000Z'),
          status: 'RERUN_LIVE'
        })
      })
    )
    await runWithFinalizer(
      Effect.gen(function* () {
        const finalizer = yield* MajorityJudgmentFinalizer
        yield* finalizer.finalize({
          stateVersion: 20,
          proposerRoundTimestamp: new Date('2026-07-20T00:00:00.000Z')
        })
      })
    )
    await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo
        const response = yield* repo.getElectionResponse(7)
        expect(response.election.status).toBe('RERUN_LIVE')
        expect(response.currentRound?.round).toBe('Rerun')
        expect(response.results).toHaveLength(1)
        expect(response.results[0]?.status).toBe('ROUND_1_FAILED')
      })
    )
  })

  it('projects idempotently and preserves revotes, decimals, JSON, and dates', async () => {
    const tcState = await env.DB.prepare(
      `INSERT INTO vote_calculation_state (
         governance_component_address,
         type,
         entity_id,
         last_vote_count,
         results_computed
       ) VALUES (
         'component_rdx1cz8tzcyyj9zlactrq9nqcnnagg56fn84p4e73gvlzp2s6krde89k9y',
         'temperature_check',
         3,
         2,
         1
       )
       RETURNING id`
    ).first<{ id: number }>()
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO vote_calculation_results (state_id, vote, vote_power)
           VALUES (?, 'For', '60')`
      ).bind(tcState?.id),
      env.DB.prepare(
        `INSERT INTO vote_calculation_results (state_id, vote, vote_power)
           VALUES (?, 'Against', '40')`
      ).bind(tcState?.id)
    ])

    const response = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* MajorityJudgmentRepo

        yield* repo.projectElection(projection)
        yield* repo.projectElection(projection)

        yield* repo.commitCalculation({
          electionId: 7,
          round: 1,
          lastVoteCount: 1n,
          ballots: [
            {
              accountAddress: 'account-a',
              voteId: 0n,
              grades: [
                { candidateId: 0, grade: 4 },
                { candidateId: 1, grade: 1 }
              ],
              votingPower: '9007199254740993.000000000000000001',
              castAt: new Date('2026-07-09T00:00:00.000Z')
            }
          ],
          histograms: [
            {
              candidateId: 0,
              grade: 4,
              votingPower: '9007199254740993.000000000000000001'
            }
          ],
          result: {
            computedAt: new Date('2026-07-09T00:00:00.000Z'),
            totalVotingPower: '9007199254740993.000000000000000001',
            quorumXrd: '100',
            quorumMet: true,
            minimumMedianGrade: 2,
            candidateResults: [],
            seatedCandidateIds: [],
            reserveCandidateIds: [],
            reserveExpiresAt: null,
            referredSeats: 1,
            tieBreakIterations: 0,
            unresolvedCandidateIds: [],
            status: 'LIVE'
          }
        })

        yield* repo.commitCalculation({
          electionId: 7,
          round: 1,
          lastVoteCount: 2n,
          ballots: [
            {
              accountAddress: 'account-a',
              voteId: 1n,
              grades: [
                { candidateId: 0, grade: 2 },
                { candidateId: 1, grade: 4 }
              ],
              votingPower: '9007199254740993.000000000000000001',
              castAt: new Date('2026-07-10T00:00:00.000Z')
            }
          ],
          histograms: [
            {
              candidateId: 1,
              grade: 4,
              votingPower: '9007199254740993.000000000000000001'
            }
          ],
          result: {
            computedAt: new Date('2026-07-10T00:00:00.000Z'),
            totalVotingPower: '9007199254740993.000000000000000001',
            quorumXrd: '100',
            quorumMet: true,
            minimumMedianGrade: 2,
            candidateResults: [],
            seatedCandidateIds: [],
            reserveCandidateIds: [],
            reserveExpiresAt: null,
            referredSeats: 1,
            tieBreakIterations: 0,
            unresolvedCandidateIds: [],
            status: 'LIVE'
          }
        })

        yield* repo.projectRound({
          ...projection.round,
          round: 2,
          votingStart: new Date('2026-07-20T00:00:00.000Z'),
          votingEnd: new Date('2026-08-03T00:00:00.000Z'),
          status: 'RERUN_PENDING'
        })
        yield* repo.setPhaseStatus(7, 2, 'RERUN_PENDING')

        const ballots = yield* repo.getBallots(7, 1)
        const round = yield* repo.getRound(7, 1)
        const election = yield* repo.getElectionResponse(7)

        return { ballots, round, election }
      })
    )

    expect(response.ballots).toHaveLength(1)
    expect(response.ballots[0]?.voteId).toBe(1n)
    expect(response.ballots[0]?.votingPower).toBe(
      '9007199254740993.000000000000000001'
    )
    expect(response.round.lastVoteCount).toBe(2n)
    expect(response.round.votingEnd.toISOString()).toBe(
      '2026-07-15T00:00:00.000Z'
    )
    expect(response.election.candidates).toHaveLength(2)
    expect(response.election.result?.totalVotingPower).toBe(
      '9007199254740993.000000000000000001'
    )
    expect(response.election.result?.gradeQuantileApplied).toBe('1/2')
    expect(response.election.currentRound?.round).toBe('RoundOne')
    expect(response.election.rounds).toHaveLength(2)
    expect(response.election.results).toHaveLength(1)
    expect(response.election.results[0]?.round).toBe('RoundOne')
    expect(response.election.temperatureCheckResult).toMatchObject({
      cacheAvailable: true,
      forVotingPower: '60',
      againstVotingPower: '40',
      participationXrd: '100',
      quorumXrd: '50',
      quorumMet: true,
      approvalThreshold: '0.5',
      forShare: '0.6',
      approvalMet: true,
      calculatedPassed: true,
      recordedPassed: true,
      outcomeConsistent: true,
      passed: true
    })

    const persistedQuantile = await env.DB.prepare(
      `SELECT election.grade_quantile_num AS num,
              election.grade_quantile_den AS den,
              result.grade_quantile_applied AS applied
       FROM mj_election AS election
       JOIN mj_result AS result
         ON result.election_id = election.id
       WHERE election.id = 7 AND result.round = 1`
    ).first<{ num: number; den: number; applied: string }>()
    expect(persistedQuantile).toEqual({ num: 1, den: 2, applied: '1/2' })

    await expect(
      runWithRepository(
        Effect.gen(function* () {
          const repo = yield* MajorityJudgmentRepo
          yield* repo.commitCalculation({
            electionId: 7,
            round: 1,
            lastVoteCount: 3n,
            ballots: [
              {
                accountAddress: 'account-b',
                voteId: 2n,
                grades: [
                  { candidateId: 0, grade: 3 },
                  { candidateId: 1, grade: 3 }
                ],
                votingPower: '42',
                castAt: new Date('2026-07-11T00:00:00.000Z')
              }
            ],
            histograms: [],
            result: {
              computedAt: new Date('2026-07-11T00:00:00.000Z'),
              totalVotingPower: '42',
              // Deliberately violates the D1 constraint after the ballot
              // statement has run; the complete batch must roll back.
              quorumXrd: '0',
              quorumMet: true,
              minimumMedianGrade: 2,
              candidateResults: [],
              seatedCandidateIds: [],
              reserveCandidateIds: [],
              reserveExpiresAt: null,
              referredSeats: 1,
              tieBreakIterations: 0,
              unresolvedCandidateIds: [],
              status: 'LIVE'
            }
          })
        })
      )
    ).rejects.toBeDefined()

    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM mj_election) AS elections,
         (SELECT COUNT(*) FROM mj_candidate) AS candidates,
         (SELECT COUNT(*) FROM mj_account_ballot) AS ballots,
         (SELECT last_vote_count FROM mj_round
          WHERE election_id = 7 AND round = 1) AS lastVoteCount`
    ).first<{
      elections: number
      candidates: number
      ballots: number
      lastVoteCount: string
    }>()
    expect(counts).toEqual({
      elections: 1,
      candidates: 2,
      ballots: 1,
      lastVoteCount: '2'
    })

    const routeResponse = await SELF.fetch(
      'https://example.test/majority-judgment-election?electionId=7'
    )
    expect(routeResponse.status).toBe(200)
    expect(await routeResponse.json()).toMatchObject({
      election: {
        id: 7,
        title: 'RAC election'
      },
      result: {
        totalVotingPower: '9007199254740993.000000000000000001'
      }
    })
  })

  it('validates unknown and malformed election queries', async () => {
    const missingResponse = await SELF.fetch(
      'https://example.test/majority-judgment-election?electionId=404'
    )
    expect(missingResponse.status).toBe(404)

    const malformedResponse = await SELF.fetch(
      'https://example.test/majority-judgment-election?electionId=nope'
    )
    expect(malformedResponse.status).toBe(400)
  })
})
