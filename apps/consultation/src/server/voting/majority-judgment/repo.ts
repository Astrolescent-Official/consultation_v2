import BigNumber from 'bignumber.js'
import {
  type MajorityJudgmentCandidateGradeJson,
  type MajorityJudgmentCandidateResultJson,
  mjAccountBallot,
  mjCandidate,
  mjElection,
  mjGradeHistogram,
  mjResult,
  mjRound
} from 'db/src/schema'
import { and, asc, eq, notInArray } from 'drizzle-orm'
import { Array as A, Data, Effect, Option, pipe, Schema } from 'effect'
import {
  CandidateHttpUrlStringSchema,
  canTransitionFromRoundOneFailure,
  GradeSchema,
  MajorityJudgmentCandidateIdSchema,
  MajorityJudgmentCandidateResult,
  MajorityJudgmentElectionResponseSchema,
  type MajorityJudgmentElectionStatus,
  MajorityJudgmentElectionStatusSchema
} from 'shared/governance/index'
import { meetsQuorum } from '../../../lib/quorum'
import { VoteDatabase } from '../db/d1'
import { ORM } from '../db/orm'
import { guardedBatch } from '../pollLease'
import { VoteCalculationRepo } from '../vote-calculation/voteCalculationRepo'

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

const isTerminal = (status: string) =>
  status === 'FINAL' || status === 'FAILED' || status === 'TC_FAILED'

export const isClosedMajorityJudgmentResult = (status: string) =>
  isTerminal(status) ||
  status === 'ROUND_1_FAILED' ||
  status === 'RERUN_PENDING' ||
  status === 'TIE_UNRESOLVED'

const isPhaseLocked = (status: string) =>
  isTerminal(status) || status === 'TIE_UNRESOLVED'

const isPhaseTransitionBlocked = (
  currentStatus: string,
  nextStatus: MajorityJudgmentElectionStatus
) =>
  isPhaseLocked(currentStatus) ||
  ((nextStatus === 'RERUN_PENDING' || nextStatus === 'RERUN_LIVE') &&
    currentStatus !== 'ROUND_1_FAILED' &&
    currentStatus !== 'RERUN_PENDING' &&
    currentStatus !== 'RERUN_LIVE') ||
  (currentStatus === 'ROUND_1_FAILED' &&
    !canTransitionFromRoundOneFailure(nextStatus))

export class MajorityJudgmentRepo extends Effect.Service<MajorityJudgmentRepo>()(
  'MajorityJudgmentRepo',
  {
    dependencies: [VoteCalculationRepo.Default],
    effect: Effect.gen(function* () {
      const db = yield* ORM
      const database = yield* VoteDatabase
      const voteCalculationRepo = yield* VoteCalculationRepo

      const projectElection = Effect.fn('MajorityJudgmentRepo.projectElection')(
        function* (input: MajorityJudgmentProjectionInput) {
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
                snapshotAt: input.election.snapshotAt,
                tcVotingStart: input.election.tcVotingStart,
                tcVotingEnd: input.election.tcVotingEnd,
                tcQuorumXrd: input.election.tcQuorumXrd,
                tcApprovalThreshold: input.election.tcApprovalThreshold,
                tcOutcome: input.election.tcOutcome,
                tcOutcomeRecordedAt: input.election.tcOutcomeRecordedAt,
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

      const getTemperatureCheckVerdict = Effect.fn(
        'MajorityJudgmentRepo.getTemperatureCheckVerdict'
      )(function* (input: {
        readonly temperatureCheckId: number
        readonly quorumXrd: string
        readonly approvalThreshold: string
        readonly recordedOutcome: 'PASSED' | 'FAILED' | null
      }) {
        const tcResults = yield* voteCalculationRepo.getResultsByEntity(
          'temperature_check',
          input.temperatureCheckId
        )
        const forVotingPower = new BigNumber(
          tcResults.results.find(({ vote }) => vote === 'For')?.votePower ?? '0'
        )
        const againstVotingPower = new BigNumber(
          tcResults.results.find(({ vote }) => vote === 'Against')?.votePower ??
            '0'
        )
        const participation = forVotingPower.plus(againstVotingPower)
        const forShare = participation.isZero()
          ? new BigNumber(0)
          : forVotingPower.dividedBy(participation)
        const quorumMet = meetsQuorum(participation, input.quorumXrd)
        const approvalMet = forShare.isGreaterThanOrEqualTo(
          input.approvalThreshold
        )
        const calculatedPassed = quorumMet && approvalMet
        const recordedPassed =
          input.recordedOutcome === null
            ? null
            : input.recordedOutcome === 'PASSED'

        return {
          forVotingPower: forVotingPower.toFixed(),
          againstVotingPower: againstVotingPower.toFixed(),
          participationXrd: participation.toFixed(),
          quorumXrd: input.quorumXrd,
          quorumMet,
          approvalThreshold: input.approvalThreshold,
          forShare: forShare.toFixed(),
          approvalMet,
          calculatedPassed,
          recordedPassed,
          outcomeConsistent:
            recordedPassed === null ? null : recordedPassed === calculatedPassed
        } as const
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
        function* (
          electionId: number,
          round: number,
          status: MajorityJudgmentElectionStatus
        ) {
          const rows = yield* db
            .select({ status: mjElection.status })
            .from(mjElection)
            .where(eq(mjElection.id, electionId))
            .limit(1)
          const currentStatus = rows[0]?.status
          if (
            currentStatus === undefined ||
            isPhaseTransitionBlocked(currentStatus, status)
          ) {
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
            notInArray(mjElection.status, [
              'FINAL',
              'FAILED',
              'TC_FAILED',
              'TIE_UNRESOLVED'
            ])
          )
          .orderBy(asc(mjElection.id), asc(mjRound.round))
      })

      const commitCalculation = Effect.fn(
        'MajorityJudgmentRepo.commitCalculation'
      )(function* (input: CommitMajorityJudgmentCalculationInput) {
        const existingRound = yield* db
          .select({ round: mjRound.round })
          .from(mjRound)
          .where(
            and(
              eq(mjRound.electionId, input.electionId),
              eq(mjRound.round, input.round)
            )
          )
          .limit(1)
        if (existingRound[0] === undefined) {
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

        // Keep ballot and histogram sets in JSON-backed statements: D1 batches
        // are atomic, and Workers Free permits only 50 D1 queries per invocation.
        const statements: Array<D1PreparedStatement> = []
        if (A.isNonEmptyReadonlyArray(input.ballots)) {
          const ballotsJson = JSON.stringify(
            input.ballots.map((ballot) => ({
              ...ballot,
              voteId: ballot.voteId.toString(),
              castAt: ballot.castAt.getTime()
            }))
          )
          statements.push(
            database
              .prepare(
                `INSERT INTO mj_account_ballot (
                   election_id, round, account_address, vote_id, grades,
                   voting_power, cast_at
                 )
                 SELECT ?, ?, json_extract(value, '$.accountAddress'),
                   json_extract(value, '$.voteId'),
                   json_extract(value, '$.grades'),
                   json_extract(value, '$.votingPower'),
                   json_extract(value, '$.castAt')
                 FROM json_each(?)
                 WHERE true
                 ON CONFLICT(election_id, round, account_address) DO UPDATE SET
                   vote_id = excluded.vote_id,
                   grades = excluded.grades,
                   voting_power = excluded.voting_power,
                   cast_at = excluded.cast_at`
              )
              .bind(input.electionId, input.round, ballotsJson)
          )
        }

        statements.push(
          database
            .prepare(
              `DELETE FROM mj_grade_histogram
               WHERE election_id = ? AND round = ?`
            )
            .bind(input.electionId, input.round)
        )
        if (A.isNonEmptyReadonlyArray(input.histograms)) {
          statements.push(
            database
              .prepare(
                `INSERT INTO mj_grade_histogram (
                   election_id, round, candidate_id, grade, voting_power
                 )
                 SELECT ?, ?, json_extract(value, '$.candidateId'),
                   json_extract(value, '$.grade'),
                   json_extract(value, '$.votingPower')
                 FROM json_each(?)`
              )
              .bind(
                input.electionId,
                input.round,
                JSON.stringify(input.histograms)
              )
          )
        }

        statements.push(
          database
            .prepare(
              `INSERT INTO mj_result (
                 election_id, round, computed_at, total_voting_power,
                 quorum_xrd, quorum_met, minimum_median_grade,
                 candidate_results, seated_candidate_ids,
                 reserve_candidate_ids, reserve_expires_at, referred_seats,
                 tie_break_iterations, unresolved_candidate_ids, status
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(election_id, round) DO UPDATE SET
                 computed_at = excluded.computed_at,
                 total_voting_power = excluded.total_voting_power,
                 quorum_xrd = excluded.quorum_xrd,
                 quorum_met = excluded.quorum_met,
                 minimum_median_grade = excluded.minimum_median_grade,
                 candidate_results = excluded.candidate_results,
                 seated_candidate_ids = excluded.seated_candidate_ids,
                 reserve_candidate_ids = excluded.reserve_candidate_ids,
                 reserve_expires_at = excluded.reserve_expires_at,
                 referred_seats = excluded.referred_seats,
                 tie_break_iterations = excluded.tie_break_iterations,
                 unresolved_candidate_ids = excluded.unresolved_candidate_ids,
                 status = excluded.status`
            )
            .bind(
              input.electionId,
              input.round,
              input.result.computedAt.getTime(),
              input.result.totalVotingPower,
              input.result.quorumXrd,
              input.result.quorumMet ? 1 : 0,
              input.result.minimumMedianGrade,
              JSON.stringify(input.result.candidateResults),
              JSON.stringify(input.result.seatedCandidateIds),
              JSON.stringify(input.result.reserveCandidateIds),
              input.result.reserveExpiresAt?.getTime() ?? null,
              input.result.referredSeats,
              input.result.tieBreakIterations,
              JSON.stringify(input.result.unresolvedCandidateIds),
              input.result.status
            ),
          database
            .prepare(
              `UPDATE mj_round
               SET last_vote_count = ?, status = ?
               WHERE election_id = ? AND round = ?`
            )
            .bind(
              input.lastVoteCount.toString(),
              input.result.status,
              input.electionId,
              input.round
            )
        )

        if (input.updateElectionStatus !== false) {
          statements.push(
            database
              .prepare('UPDATE mj_election SET status = ? WHERE id = ?')
              .bind(input.result.status, input.electionId)
          )
        }

        yield* guardedBatch(
          database,
          'commit majority judgment calculation',
          statements
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
        const hasRoundTwoResult = results.some(({ round }) => round === 2)
        const activeRoundNumber =
          hasRoundTwoResult ||
          election.status === 'RERUN_PENDING' ||
          election.status === 'RERUN_LIVE'
            ? 2
            : 1
        const currentRound = yield* pipe(
          rounds.find(({ round }) => round === activeRoundNumber),
          Option.fromNullable,
          Option.match({
            onNone: () =>
              Effect.fail(
                new MajorityJudgmentRoundNotFoundError({
                  electionId,
                  round: activeRoundNumber
                })
              ),
            onSome: Effect.succeed
          })
        )
        const result = results.find(({ round }) => round === currentRound.round)
        const temperatureCheckResult = yield* getTemperatureCheckVerdict({
          temperatureCheckId: election.temperatureCheckId,
          quorumXrd: election.tcQuorumXrd,
          approvalThreshold: election.tcApprovalThreshold,
          recordedOutcome:
            election.tcOutcome === 'PASSED'
              ? 'PASSED'
              : election.tcOutcome === 'FAILED'
                ? 'FAILED'
                : null
        })
        const mapRound = (round: (typeof rounds)[number]) => ({
          round: round.round === 1 ? ('RoundOne' as const) : ('Rerun' as const),
          snapshotAt: round.snapshotAt.toISOString(),
          votingStart: round.votingStart.toISOString(),
          votingEnd: round.votingEnd.toISOString(),
          quorumXrd: round.quorumXrd,
          minimumMedianGrade: round.minimumMedianGrade
        })
        const mapResult = (storedResult: (typeof results)[number]) => ({
          status: storedResult.status,
          round:
            storedResult.round === 1
              ? ('RoundOne' as const)
              : ('Rerun' as const),
          provisional:
            storedResult.status === 'LIVE' ||
            storedResult.status === 'RERUN_LIVE',
          totalVotingPower: storedResult.totalVotingPower,
          quorumXrd: storedResult.quorumXrd,
          quorumMet: storedResult.quorumMet,
          minimumMedianGrade: storedResult.minimumMedianGrade,
          candidateResults: storedResult.candidateResults,
          seatedCandidateIds: storedResult.seatedCandidateIds,
          reserveCandidateIds: storedResult.reserveCandidateIds,
          reserveExpiresAt:
            storedResult.reserveExpiresAt?.toISOString() ?? null,
          referredSeats: storedResult.referredSeats,
          tieBreakIterations: storedResult.tieBreakIterations,
          unresolvedCandidateIds: storedResult.unresolvedCandidateIds
        })

        const response = {
          election: {
            id: election.id,
            temperatureCheckId: election.temperatureCheckId,
            roleId: election.roleId,
            title: election.title,
            shortDescription: election.shortDescription,
            description: election.description,
            seatCount: election.seatCount,
            snapshotAt: election.snapshotAt.toISOString(),
            tcVotingStart: election.tcVotingStart.toISOString(),
            tcVotingEnd: election.tcVotingEnd.toISOString(),
            tcQuorumXrd: election.tcQuorumXrd,
            tcApprovalThreshold: election.tcApprovalThreshold,
            tcOutcome: election.tcOutcome ?? 'PENDING',
            tcOutcomeRecordedAt:
              election.tcOutcomeRecordedAt?.toISOString() ?? null,
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
          currentRound: mapRound(currentRound),
          rounds: rounds.map(mapRound),
          temperatureCheckResult: {
            ...temperatureCheckResult,
            passed:
              election.tcOutcome === null
                ? null
                : election.tcOutcome === 'PASSED',
            recordedAt: election.tcOutcomeRecordedAt?.toISOString() ?? null
          },
          ...(result === undefined ||
          election.status === 'PENDING' ||
          election.status === 'TC_LIVE' ||
          election.status === 'TC_FAILED' ||
          election.status === 'MJ_PENDING' ||
          election.status === 'RERUN_PENDING'
            ? {}
            : {
                result: mapResult({ ...result, status: election.status })
              }),
          results: results.map(mapResult)
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
        getTemperatureCheckVerdict,
        setSnapshotStateVersion,
        setPhaseStatus,
        getActiveElectionRounds,
        commitCalculation,
        getElectionResponse
      }
    })
  }
) {}
