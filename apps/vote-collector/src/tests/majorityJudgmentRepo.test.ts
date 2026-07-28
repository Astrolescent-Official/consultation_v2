import { assert, layer } from '@effect/vitest'
import {
  mjAccountBallot,
  mjCandidate,
  mjElection,
  mjGradeHistogram,
  mjResult,
  mjRound
} from 'db/src/schema'
import { sql } from 'drizzle-orm'
import { ConfigProvider, Effect, Layer } from 'effect'
import { DatabaseMigrations } from '../db/migrate'
import { ORM } from '../db/orm'
import { PgContainer } from '../db/pgContainer'
import { MajorityJudgmentFinalizer } from '../majority-judgment/finalizer'
import { MajorityJudgmentRepo } from '../majority-judgment/repo'

const DatabaseLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const db = yield* PgContainer
    return DatabaseMigrations.Default.pipe(
      Layer.provide(
        Layer.setConfigProvider(
          ConfigProvider.fromJson({
            DATABASE_URL: db.getConnectionUri()
          })
        )
      )
    )
  })
)

const TestLayer = MajorityJudgmentFinalizer.Default.pipe(
  Layer.provideMerge(MajorityJudgmentRepo.Default),
  Layer.provideMerge(DatabaseLayer),
  Layer.provide(PgContainer.Default),
  Layer.provideMerge(ORM.Default),
  Layer.provideMerge(PgContainer.ClientLive)
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
    reviewStart: new Date('2026-07-01T00:00:00.000Z'),
    reviewEnd: new Date('2026-07-08T00:00:00.000Z'),
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
}

layer(TestLayer, { timeout: '60 seconds' })(
  'majority judgment PostgreSQL repository',
  (it) => {
    it.effect('projects idempotently and replaces revotes atomically', () =>
      Effect.gen(function* () {
        const migrate = yield* DatabaseMigrations
        const repo = yield* MajorityJudgmentRepo
        const finalizer = yield* MajorityJudgmentFinalizer
        const db = yield* ORM
        yield* migrate()

        yield* db.delete(mjResult)
        yield* db.delete(mjGradeHistogram)
        yield* db.delete(mjAccountBallot)
        yield* db.delete(mjRound)
        yield* db.delete(mjCandidate)
        yield* db.delete(mjElection)

        yield* repo.projectElection(projection)
        yield* repo.projectElection(projection)

        assert.strictEqual((yield* db.select().from(mjElection)).length, 1)
        assert.strictEqual((yield* db.select().from(mjCandidate)).length, 2)
        assert.strictEqual((yield* db.select().from(mjRound)).length, 1)

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
              votingPower: '10',
              castAt: new Date('2026-07-09T00:00:00.000Z')
            }
          ],
          histograms: [
            { candidateId: 0, grade: 4, votingPower: '10' },
            { candidateId: 1, grade: 1, votingPower: '10' }
          ],
          result: {
            computedAt: new Date('2026-07-09T00:00:00.000Z'),
            totalVotingPower: '10',
            quorumXrd: '100',
            quorumMet: false,
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
              votingPower: '10',
              castAt: new Date('2026-07-10T00:00:00.000Z')
            }
          ],
          histograms: [
            { candidateId: 0, grade: 2, votingPower: '10' },
            { candidateId: 1, grade: 4, votingPower: '10' }
          ],
          result: {
            computedAt: new Date('2026-07-10T00:00:00.000Z'),
            totalVotingPower: '10',
            quorumXrd: '100',
            quorumMet: false,
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
        const histograms = yield* repo.getHistograms(7, 1)
        const round = yield* repo.getRound(7, 1)
        const response = yield* repo.getElectionResponse(7)

        assert.strictEqual(ballots.length, 1)
        assert.strictEqual(ballots[0]?.voteId, 1n)
        assert.deepStrictEqual(
          histograms.map(({ candidateId, grade, votingPower }) => ({
            candidateId,
            grade,
            votingPower
          })),
          [
            { candidateId: 0, grade: 2, votingPower: '10' },
            { candidateId: 1, grade: 4, votingPower: '10' }
          ]
        )
        assert.strictEqual(round.lastVoteCount, 2n)
        assert.strictEqual(response.election.id, 7)
        assert.strictEqual(response.candidates.length, 2)
        assert.strictEqual(response.result?.provisional, true)

        yield* finalizer.finalize(new Date('2026-07-16T00:00:00.000Z'))
        yield* finalizer.finalize(new Date('2026-07-16T00:00:00.000Z'))

        const finalized = yield* repo.getElectionResponse(7)
        assert.strictEqual(finalized.election.status, 'RERUN_PENDING')
        assert.isUndefined(finalized.result)

        const closedRoundUpdate = yield* Effect.either(
          repo.commitCalculation({
            electionId: 7,
            round: 1,
            lastVoteCount: 3n,
            ballots: [],
            histograms: [],
            result: {
              computedAt: new Date('2026-07-17T00:00:00.000Z'),
              totalVotingPower: '10',
              quorumXrd: '100',
              quorumMet: false,
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
        )
        assert.strictEqual(closedRoundUpdate._tag, 'Left')
        if (closedRoundUpdate._tag === 'Left') {
          assert.strictEqual(
            closedRoundUpdate.left._tag,
            'TerminalMajorityJudgmentResultError'
          )
        }

        yield* repo.projectRound({
          electionId: 7,
          round: 2,
          snapshotAt: new Date('2026-07-18T00:00:00.000Z'),
          snapshotStateVersion: 456n,
          votingStart: new Date('2026-07-20T00:00:00.000Z'),
          votingEnd: new Date('2026-07-25T00:00:00.000Z'),
          quorumXrd: '50',
          minimumMedianGrade: 3,
          votesKvsAddress: 'internal_keyvaluestore_rerun_votes',
          votersKvsAddress: 'internal_keyvaluestore_rerun_voters',
          lastVoteCount: 0n,
          status: 'RERUN_LIVE'
        })
        yield* repo.setPhaseStatus(7, 2, 'RERUN_LIVE')
        yield* repo.commitCalculation({
          electionId: 7,
          round: 2,
          lastVoteCount: 1n,
          ballots: [
            {
              accountAddress: 'account-a',
              voteId: 0n,
              grades: [
                { candidateId: 0, grade: 4 },
                { candidateId: 1, grade: 2 }
              ],
              votingPower: '5',
              castAt: new Date('2026-07-21T00:00:00.000Z')
            }
          ],
          histograms: [
            { candidateId: 0, grade: 4, votingPower: '5' },
            { candidateId: 1, grade: 2, votingPower: '5' }
          ],
          result: {
            computedAt: new Date('2026-07-21T00:00:00.000Z'),
            totalVotingPower: '5',
            quorumXrd: '50',
            quorumMet: false,
            minimumMedianGrade: 3,
            candidateResults: [],
            seatedCandidateIds: [],
            reserveCandidateIds: [],
            reserveExpiresAt: null,
            referredSeats: 1,
            tieBreakIterations: 0,
            unresolvedCandidateIds: [],
            status: 'RERUN_LIVE'
          }
        })

        assert.strictEqual((yield* repo.getBallots(7, 1)).length, 1)
        assert.strictEqual((yield* repo.getBallots(7, 2)).length, 1)

        yield* finalizer.finalize(new Date('2026-07-26T00:00:00.000Z'))
        yield* finalizer.finalize(new Date('2026-07-26T00:00:00.000Z'))

        const failed = yield* repo.getElectionResponse(7)
        assert.strictEqual(failed.election.status, 'FAILED')
        assert.strictEqual(failed.result?.provisional, false)
        assert.strictEqual(failed.result?.status, 'FAILED')

        const terminalUpdate = yield* Effect.either(
          repo.commitCalculation({
            electionId: 7,
            round: 2,
            lastVoteCount: 2n,
            ballots: [],
            histograms: [],
            result: {
              computedAt: new Date('2026-07-27T00:00:00.000Z'),
              totalVotingPower: '5',
              quorumXrd: '50',
              quorumMet: false,
              minimumMedianGrade: 3,
              candidateResults: [],
              seatedCandidateIds: [],
              reserveCandidateIds: [],
              reserveExpiresAt: null,
              referredSeats: 1,
              tieBreakIterations: 0,
              unresolvedCandidateIds: [],
              status: 'RERUN_LIVE'
            }
          })
        )
        assert.strictEqual(terminalUpdate._tag, 'Left')
        if (terminalUpdate._tag === 'Left') {
          assert.strictEqual(
            terminalUpdate.left._tag,
            'TerminalMajorityJudgmentResultError'
          )
        }

        yield* db.execute(
          sql`UPDATE ${mjAccountBallot}
              SET ${sql.identifier('grades')} =
                '[{"candidateId":0,"grade":9},{"candidateId":1,"grade":2}]'::jsonb`
        )
        const malformedBallot = yield* Effect.either(repo.getBallots(7, 2))
        assert.strictEqual(malformedBallot._tag, 'Left')
      })
    )
  }
)
