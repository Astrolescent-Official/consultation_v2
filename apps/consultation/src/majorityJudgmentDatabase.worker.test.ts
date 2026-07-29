/// <reference types="@cloudflare/vitest-pool-workers" />

import { applyD1Migrations, env, SELF } from 'cloudflare:test'
import * as D1Client from '@effect/sql-d1/D1Client'
import { Effect, Layer } from 'effect'
import { GovernanceConfig } from 'shared/governance/config'
import { beforeEach, describe, expect, it } from 'vitest'
import { VoteDatabaseLive } from './server/voting/db/d1'
import { ORM } from './server/voting/db/orm'
import {
  type MajorityJudgmentProjectionInput,
  MajorityJudgmentRepo
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

const projection = {
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
  it('projects idempotently and preserves revotes, decimals, JSON, and dates', async () => {
    const tcState = await env.DB.prepare(
      `INSERT INTO vote_calculation_state (
         governance_component_address,
         type,
         entity_id,
         last_vote_count
       ) VALUES (
         'component_rdx1cz8tzcyyj9zlactrq9nqcnnagg56fn84p4e73gvlzp2s6krde89k9y',
         'temperature_check',
         3,
         2
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
    expect(response.election.temperatureCheckResult).toMatchObject({
      forVotingPower: '60',
      againstVotingPower: '40',
      participationXrd: '100',
      quorumXrd: '50',
      quorumMet: true,
      approvalThreshold: '0.5',
      forShare: '0.6',
      approvalMet: true,
      passed: true
    })

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
