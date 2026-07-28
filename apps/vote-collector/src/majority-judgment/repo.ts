import { SqlClient } from '@effect/sql/SqlClient'
import {
  mjAccountBallot,
  mjCandidate,
  mjElection,
  mjGradeHistogram,
  mjResult,
  mjRound,
  type MajorityJudgmentCandidateGradeJson,
  type MajorityJudgmentCandidateResultJson
} from 'db/src/schema'
import { and, asc, eq, notInArray } from 'drizzle-orm'
import { Array as A, Data, Effect, Option, Schema, pipe } from 'effect'
import {
  CandidateHttpUrlStringSchema,
  GradeSchema,
  MajorityJudgmentCandidateIdSchema,
  MajorityJudgmentCandidateResult,
  MajorityJudgmentElectionResponseSchema,
  MajorityJudgmentElectionStatusSchema
} from 'shared/governance/index'
import { ORM } from '../db/orm'

type ElectionProjection = typeof mjElection.$inferInsert
type CandidateProjection = typeof mjCandidate.$inferInsert
type RoundProjection = typeof mjRound.$inferInsert

const StoredCandidateGradesSchema = Schema.Array(
  Schema.Struct({
    candidateId: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
    grade: GradeSchema
  })
)
const StoredCandidateLinksSchema = Schema.Array(
  CandidateHttpUrlStringSchema
).pipe(Schema.maxItems(5))
const StoredResultJsonSchema = Schema.Struct({
  minimumMedianGrade: GradeSchema,
  candidateResults: Schema.Array(MajorityJudgmentCandidateResult),
  seatedCandidateIds: Schema.Array(MajorityJudgmentCandidateIdSchema),
  reserveCandidateIds: Schema.Array(MajorityJudgmentCandidateIdSchema),
  unresolvedCandidateIds: Schema.Array(MajorityJudgmentCandidateIdSchema),
  status: MajorityJudgmentElectionStatusSchema
})

export type MajorityJudgmentProjectionInput = {
  readonly election: ElectionProjection
  readonly candidates: ReadonlyArray<CandidateProjection>
  readonly round: RoundProjection
}

export type MajorityJudgmentBallotWrite = {
  readonly accountAddress: string
  readonly voteId: bigint
  readonly grades: ReadonlyArray<MajorityJudgmentCandidateGradeJson>
  readonly votingPower: string
  readonly castAt: Date
}

export type MajorityJudgmentHistogramWrite = {
  readonly candidateId: number
  readonly grade: number
  readonly votingPower: string
}

export type MajorityJudgmentResultWrite = {
  readonly computedAt: Date
  readonly totalVotingPower: string
  readonly quorumXrd: string
  readonly quorumMet: boolean
  readonly minimumMedianGrade: number
  readonly candidateResults: ReadonlyArray<MajorityJudgmentCandidateResultJson>
  readonly seatedCandidateIds: ReadonlyArray<number>
  readonly reserveCandidateIds: ReadonlyArray<number>
  readonly reserveExpiresAt: Date | null
  readonly referredSeats: number
  readonly tieBreakIterations: number
  readonly unresolvedCandidateIds: ReadonlyArray<number>
  readonly status: string
}

export type CommitMajorityJudgmentCalculationInput = {
  readonly electionId: number
  readonly round: number
  readonly lastVoteCount: bigint
  readonly ballots: ReadonlyArray<MajorityJudgmentBallotWrite>
  readonly histograms: ReadonlyArray<MajorityJudgmentHistogramWrite>
  readonly result: MajorityJudgmentResultWrite
  readonly allowTieResolution?: boolean
  // Closing a superseded earlier round must not move the election off the round
  // it is currently running.
  readonly updateElectionStatus?: boolean
}

export class MajorityJudgmentRoundNotFoundError extends Data.TaggedError(
  'MajorityJudgmentRoundNotFoundError'
)<{
  readonly electionId: number
  readonly round: number
}> {}

export class MajorityJudgmentProjectionNotFoundError extends Data.TaggedError(
  'MajorityJudgmentProjectionNotFoundError'
)<{
  readonly electionId: number
}> {}

export class TerminalMajorityJudgmentResultError extends Data.TaggedError(
  'TerminalMajorityJudgmentResultError'
)<{
  readonly electionId: number
  readonly round: number
  readonly status: string
}> {}

const isTerminal = (status: string) => status === 'FINAL' || status === 'FAILED'

export const isClosedMajorityJudgmentResult = (status: string) =>
  isTerminal(status) ||
  status === 'RERUN_PENDING' ||
  status === 'TIE_UNRESOLVED'

const isPhaseLocked = (status: string) =>
  isTerminal(status) || status === 'TIE_UNRESOLVED'

export class MajorityJudgmentRepo extends Effect.Service<MajorityJudgmentRepo>()(
  'MajorityJudgmentRepo',
  {
    effect: Effect.gen(function* () {
      const db = yield* ORM
      const sqlClient = yield* SqlClient

      const projectElection = Effect.fn('MajorityJudgmentRepo.projectElection')(
        function* (input: MajorityJudgmentProjectionInput) {
          yield* sqlClient.withTransaction(
            Effect.gen(function* () {
              yield* db
                .insert(mjElection)
                .values(input.election)
                .onConflictDoUpdate({
                  target: mjElection.id,
                  set: {
                    temperatureCheckId: input.election.temperatureCheckId,
                    roleId: input.election.roleId,
                    title: input.election.title,
                    shortDescription: input.election.shortDescription,
                    description: input.election.description,
                    seatCount: input.election.seatCount,
                    reviewStart: input.election.reviewStart,
                    reviewEnd: input.election.reviewEnd,
                    parameterSetId: input.election.parameterSetId,
                    parameterSetVersion: input.election.parameterSetVersion,
                    reserveListDays: input.election.reserveListDays,
                    hidden: input.election.hidden
                  }
                })

              yield* Effect.forEach(input.candidates, (candidate) =>
                db
                  .insert(mjCandidate)
                  .values(candidate)
                  .onConflictDoUpdate({
                    target: [mjCandidate.electionId, mjCandidate.candidateId],
                    set: candidate
                  })
              )

              yield* db
                .insert(mjRound)
                .values(input.round)
                .onConflictDoUpdate({
                  target: [mjRound.electionId, mjRound.round],
                  set: {
                    snapshotAt: input.round.snapshotAt,
                    votingStart: input.round.votingStart,
                    votingEnd: input.round.votingEnd,
                    quorumXrd: input.round.quorumXrd,
                    minimumMedianGrade: input.round.minimumMedianGrade,
                    votesKvsAddress: input.round.votesKvsAddress,
                    votersKvsAddress: input.round.votersKvsAddress
                  }
                })
            })
          )
        }
      )

      const projectRound = Effect.fn('MajorityJudgmentRepo.projectRound')(
        function* (round: RoundProjection) {
          yield* db
            .insert(mjRound)
            .values(round)
            .onConflictDoUpdate({
              target: [mjRound.electionId, mjRound.round],
              set: {
                snapshotAt: round.snapshotAt,
                votingStart: round.votingStart,
                votingEnd: round.votingEnd,
                quorumXrd: round.quorumXrd,
                minimumMedianGrade: round.minimumMedianGrade,
                votesKvsAddress: round.votesKvsAddress,
                votersKvsAddress: round.votersKvsAddress
              }
            })
        }
      )

      const getCandidates = Effect.fn('MajorityJudgmentRepo.getCandidates')(
        function* (electionId: number) {
          const rows = yield* db
            .select()
            .from(mjCandidate)
            .where(eq(mjCandidate.electionId, electionId))
            .orderBy(asc(mjCandidate.candidateId))
          return yield* Effect.forEach(rows, (row) =>
            Schema.decodeUnknown(StoredCandidateLinksSchema)(row.links).pipe(
              Effect.map((links) => ({ ...row, links }))
            )
          )
        }
      )

      const getBallots = Effect.fn('MajorityJudgmentRepo.getBallots')(
        function* (electionId: number, round: number) {
          const rows = yield* db
            .select()
            .from(mjAccountBallot)
            .where(
              and(
                eq(mjAccountBallot.electionId, electionId),
                eq(mjAccountBallot.round, round)
              )
            )
            .orderBy(
              asc(mjAccountBallot.accountAddress),
              asc(mjAccountBallot.voteId)
            )
          return yield* Effect.forEach(rows, (row) =>
            Schema.decodeUnknown(StoredCandidateGradesSchema)(row.grades).pipe(
              Effect.map((grades) => ({ ...row, grades }))
            )
          )
        }
      )

      const getBallotsByAccounts = Effect.fn(
        'MajorityJudgmentRepo.getBallotsByAccounts'
      )(function* (
        electionId: number,
        round: number,
        accounts: ReadonlyArray<string>
      ) {
        if (A.isEmptyReadonlyArray(accounts)) return []
        const all = yield* getBallots(electionId, round)
        const requested = new Set(accounts)
        return all.filter(({ accountAddress }) => requested.has(accountAddress))
      })

      const getHistograms = Effect.fn('MajorityJudgmentRepo.getHistograms')(
        function* (electionId: number, round: number) {
          return yield* db
            .select()
            .from(mjGradeHistogram)
            .where(
              and(
                eq(mjGradeHistogram.electionId, electionId),
                eq(mjGradeHistogram.round, round)
              )
            )
            .orderBy(
              asc(mjGradeHistogram.candidateId),
              asc(mjGradeHistogram.grade)
            )
        }
      )

      const getRound = Effect.fn('MajorityJudgmentRepo.getRound')(function* (
        electionId: number,
        round: number
      ) {
        const rows = yield* db
          .select()
          .from(mjRound)
          .where(
            and(eq(mjRound.electionId, electionId), eq(mjRound.round, round))
          )
          .limit(1)

        return yield* pipe(
          rows,
          A.head,
          Option.match({
            onNone: () =>
              Effect.fail(
                new MajorityJudgmentRoundNotFoundError({ electionId, round })
              ),
            onSome: Effect.succeed
          })
        )
      })

      const getResult = Effect.fn('MajorityJudgmentRepo.getResult')(function* (
        electionId: number,
        round: number
      ) {
        const rows = yield* db
          .select()
          .from(mjResult)
          .where(
            and(eq(mjResult.electionId, electionId), eq(mjResult.round, round))
          )
          .limit(1)
        const result = A.head(rows)
        if (Option.isNone(result)) return result
        const decodedJson = yield* Schema.decodeUnknown(StoredResultJsonSchema)(
          {
            minimumMedianGrade: result.value.minimumMedianGrade,
            candidateResults: result.value.candidateResults,
            seatedCandidateIds: result.value.seatedCandidateIds,
            reserveCandidateIds: result.value.reserveCandidateIds,
            unresolvedCandidateIds: result.value.unresolvedCandidateIds,
            status: result.value.status
          }
        )
        return Option.some({ ...result.value, ...decodedJson })
      })

      const setSnapshotStateVersion = Effect.fn(
        'MajorityJudgmentRepo.setSnapshotStateVersion'
      )(function* (
        electionId: number,
        round: number,
        snapshotStateVersion: bigint
      ) {
        yield* db
          .update(mjRound)
          .set({ snapshotStateVersion })
          .where(
            and(eq(mjRound.electionId, electionId), eq(mjRound.round, round))
          )
      })

      const setPhaseStatus = Effect.fn('MajorityJudgmentRepo.setPhaseStatus')(
        function* (electionId: number, round: number, status: string) {
          yield* sqlClient.withTransaction(
            Effect.gen(function* () {
              const rows = yield* db
                .select({ status: mjElection.status })
                .from(mjElection)
                .where(eq(mjElection.id, electionId))
                .limit(1)
              const currentStatus = rows[0]?.status
              if (currentStatus === undefined || isPhaseLocked(currentStatus)) {
                return
              }
              yield* Effect.all([
                db
                  .update(mjElection)
                  .set({ status })
                  .where(eq(mjElection.id, electionId)),
                db
                  .update(mjRound)
                  .set({ status })
                  .where(
                    and(
                      eq(mjRound.electionId, electionId),
                      eq(mjRound.round, round)
                    )
                  )
              ])
            })
          )
        }
      )

      const getActiveElectionRounds = Effect.fn(
        'MajorityJudgmentRepo.getActiveElectionRounds'
      )(function* () {
        return yield* db
          .select({
            election: mjElection,
            round: mjRound
          })
          .from(mjElection)
          .innerJoin(mjRound, eq(mjRound.electionId, mjElection.id))
          .where(
            notInArray(mjElection.status, ['FINAL', 'FAILED', 'TIE_UNRESOLVED'])
          )
          .orderBy(asc(mjElection.id), asc(mjRound.round))
      })

      const commitCalculation = Effect.fn(
        'MajorityJudgmentRepo.commitCalculation'
      )(function* (input: CommitMajorityJudgmentCalculationInput) {
        yield* sqlClient.withTransaction(
          Effect.gen(function* () {
            const lockedRound = yield* db
              .select({ round: mjRound.round })
              .from(mjRound)
              .where(
                and(
                  eq(mjRound.electionId, input.electionId),
                  eq(mjRound.round, input.round)
                )
              )
              .for('update')
              .limit(1)
            if (lockedRound[0] === undefined) {
              return yield* new MajorityJudgmentRoundNotFoundError({
                electionId: input.electionId,
                round: input.round
              })
            }

            const current = yield* db
              .select({ status: mjResult.status })
              .from(mjResult)
              .where(
                and(
                  eq(mjResult.electionId, input.electionId),
                  eq(mjResult.round, input.round)
                )
              )
              .for('update')
              .limit(1)
            const currentStatus = current[0]?.status
            const isAllowedTieResolution =
              input.allowTieResolution === true &&
              currentStatus === 'TIE_UNRESOLVED' &&
              input.result.status === 'FINAL'
            if (
              currentStatus !== undefined &&
              isClosedMajorityJudgmentResult(currentStatus) &&
              !isAllowedTieResolution
            ) {
              return yield* new TerminalMajorityJudgmentResultError({
                electionId: input.electionId,
                round: input.round,
                status: currentStatus
              })
            }

            if (A.isNonEmptyReadonlyArray(input.ballots)) {
              yield* Effect.forEach(input.ballots, (ballot) =>
                db
                  .insert(mjAccountBallot)
                  .values({
                    electionId: input.electionId,
                    round: input.round,
                    ...ballot
                  })
                  .onConflictDoUpdate({
                    target: [
                      mjAccountBallot.electionId,
                      mjAccountBallot.round,
                      mjAccountBallot.accountAddress
                    ],
                    set: ballot
                  })
              )
            }

            yield* db
              .delete(mjGradeHistogram)
              .where(
                and(
                  eq(mjGradeHistogram.electionId, input.electionId),
                  eq(mjGradeHistogram.round, input.round)
                )
              )
            if (A.isNonEmptyReadonlyArray(input.histograms)) {
              yield* db.insert(mjGradeHistogram).values(
                input.histograms.map((histogram) => ({
                  electionId: input.electionId,
                  round: input.round,
                  ...histogram
                }))
              )
            }

            yield* db
              .insert(mjResult)
              .values({
                electionId: input.electionId,
                round: input.round,
                ...input.result
              })
              .onConflictDoUpdate({
                target: [mjResult.electionId, mjResult.round],
                set: input.result
              })

            yield* db
              .update(mjRound)
              .set({
                lastVoteCount: input.lastVoteCount,
                status: input.result.status
              })
              .where(
                and(
                  eq(mjRound.electionId, input.electionId),
                  eq(mjRound.round, input.round)
                )
              )

            if (input.updateElectionStatus !== false) {
              yield* db
                .update(mjElection)
                .set({ status: input.result.status })
                .where(eq(mjElection.id, input.electionId))
            }
          })
        )
      })

      const getElectionResponse = Effect.fn(
        'MajorityJudgmentRepo.getElectionResponse'
      )(function* (electionId: number) {
        const [elections, candidates, rounds, results] = yield* Effect.all([
          db
            .select()
            .from(mjElection)
            .where(eq(mjElection.id, electionId))
            .limit(1),
          db
            .select()
            .from(mjCandidate)
            .where(eq(mjCandidate.electionId, electionId))
            .orderBy(asc(mjCandidate.displayOrder)),
          db
            .select()
            .from(mjRound)
            .where(eq(mjRound.electionId, electionId))
            .orderBy(asc(mjRound.round)),
          db
            .select()
            .from(mjResult)
            .where(eq(mjResult.electionId, electionId))
            .orderBy(asc(mjResult.round))
        ])

        const election = yield* pipe(
          elections,
          A.head,
          Option.match({
            onNone: () =>
              Effect.fail(
                new MajorityJudgmentProjectionNotFoundError({ electionId })
              ),
            onSome: Effect.succeed
          })
        )
        const currentRound = yield* pipe(
          rounds,
          A.last,
          Option.match({
            onNone: () =>
              Effect.fail(
                new MajorityJudgmentRoundNotFoundError({
                  electionId,
                  round: 1
                })
              ),
            onSome: Effect.succeed
          })
        )
        const result = results.find(({ round }) => round === currentRound.round)

        const response = {
          election: {
            id: election.id,
            temperatureCheckId: election.temperatureCheckId,
            roleId: election.roleId,
            title: election.title,
            shortDescription: election.shortDescription,
            description: election.description,
            seatCount: election.seatCount,
            reviewStart: election.reviewStart.toISOString(),
            reviewEnd: election.reviewEnd.toISOString(),
            parameterSetId: election.parameterSetId,
            parameterSetVersion: election.parameterSetVersion,
            reserveListDays: election.reserveListDays,
            status: election.status,
            hidden: election.hidden
          },
          candidates: candidates.map((candidate) => ({
            id: candidate.candidateId,
            reference: candidate.reference,
            displayName: candidate.displayName,
            description: candidate.description,
            links: candidate.links,
            displayOrder: candidate.displayOrder
          })),
          currentRound: {
            round: currentRound.round === 1 ? 'RoundOne' : 'Rerun',
            snapshotAt: currentRound.snapshotAt.toISOString(),
            votingStart: currentRound.votingStart.toISOString(),
            votingEnd: currentRound.votingEnd.toISOString(),
            quorumXrd: currentRound.quorumXrd,
            minimumMedianGrade: currentRound.minimumMedianGrade
          },
          ...(result === undefined ||
          election.status === 'PENDING' ||
          election.status === 'REVIEW_OPEN' ||
          election.status === 'RERUN_PENDING'
            ? {}
            : {
                result: {
                  status: election.status,
                  round: currentRound.round === 1 ? 'RoundOne' : 'Rerun',
                  provisional:
                    result.status === 'LIVE' || result.status === 'RERUN_LIVE',
                  totalVotingPower: result.totalVotingPower,
                  quorumXrd: result.quorumXrd,
                  quorumMet: result.quorumMet,
                  minimumMedianGrade: result.minimumMedianGrade,
                  candidateResults: result.candidateResults,
                  seatedCandidateIds: result.seatedCandidateIds,
                  reserveCandidateIds: result.reserveCandidateIds,
                  reserveExpiresAt:
                    result.reserveExpiresAt?.toISOString() ?? null,
                  referredSeats: result.referredSeats,
                  tieBreakIterations: result.tieBreakIterations,
                  unresolvedCandidateIds: result.unresolvedCandidateIds
                }
              })
        }

        return yield* Schema.decodeUnknown(
          MajorityJudgmentElectionResponseSchema
        )(response)
      })

      return {
        projectElection,
        projectRound,
        getBallots,
        getBallotsByAccounts,
        getHistograms,
        getCandidates,
        getRound,
        getResult,
        setSnapshotStateVersion,
        setPhaseStatus,
        getActiveElectionRounds,
        commitCalculation,
        getElectionResponse
      }
    })
  }
) {}
