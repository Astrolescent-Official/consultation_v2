import { Data, Effect, Option, Schema } from 'effect'
import { GradeSchema } from 'shared/governance/index'
import {
  applyMajorityJudgmentTieResolution,
  calculateMajorityJudgment
} from './calculator'
import { isClosedMajorityJudgmentResult, MajorityJudgmentRepo } from './repo'

export class InvalidMajorityJudgmentTieResolutionError extends Data.TaggedError(
  'InvalidMajorityJudgmentTieResolutionError'
)<{
  readonly electionId: number
  readonly round: number
  readonly reason: string
}> {}

export type MajorityJudgmentLedgerWatermark = {
  readonly stateVersion: number
  readonly proposerRoundTimestamp: Date
}

export class MajorityJudgmentFinalizer extends Effect.Service<MajorityJudgmentFinalizer>()(
  'MajorityJudgmentFinalizer',
  {
    dependencies: [MajorityJudgmentRepo.Default],
    effect: Effect.gen(function* () {
      const repo = yield* MajorityJudgmentRepo

      const closeRound = Effect.fn('MajorityJudgmentFinalizer.closeRound')(
        function* (
          election: {
            readonly id: number
            readonly seatCount: number
            readonly reserveListDays: number
          },
          round: {
            readonly round: number
            readonly quorumXrd: string
            readonly minimumMedianGrade: number
            readonly votingEnd: Date
            readonly lastVoteCount: bigint
          },
          now: Date,
          updateElectionStatus: boolean
        ) {
          const existingResult = yield* repo.getResult(election.id, round.round)
          if (
            existingResult._tag === 'Some' &&
            isClosedMajorityJudgmentResult(existingResult.value.status)
          ) {
            return
          }

          const [ballots, candidates] = yield* Effect.all([
            repo.getBallots(election.id, round.round),
            repo.getCandidates(election.id)
          ])
          const result = calculateMajorityJudgment({
            candidates: candidates.map(({ candidateId }) => ({
              id: candidateId
            })),
            ballots: ballots.map((ballot) => ({
              accountAddress: ballot.accountAddress,
              voteId: Number(ballot.voteId),
              votingPower: ballot.votingPower,
              grades: ballot.grades
            })),
            seatCount: election.seatCount,
            quorumXrd: round.quorumXrd,
            minimumMedianGrade: round.minimumMedianGrade,
            reserveListDays: election.reserveListDays,
            roundEndsAt: round.votingEnd,
            round: round.round === 1 ? 'RoundOne' : 'Rerun'
          })

          yield* Effect.logDebug('Finalizing Majority Judgment round', {
            electionId: election.id,
            round: round.round,
            totalVotingPower: result.totalVotingPower,
            quorumXrd: result.quorumXrd,
            quorumMet: result.quorumMet,
            minimumMedianGrade: result.minimumMedianGrade,
            candidateResults: result.candidateResults,
            seatedCandidateIds: result.seatedCandidateIds,
            reserveCandidateIds: result.reserveCandidateIds,
            referredSeats: result.referredSeats,
            tieBreakIterations: result.tieBreakIterations,
            unresolvedCandidateIds: result.unresolvedCandidateIds,
            status: result.status
          })

          yield* repo.commitCalculation({
            electionId: election.id,
            round: round.round,
            lastVoteCount: round.lastVoteCount,
            updateElectionStatus,
            ballots: [],
            histograms: result.candidateResults.flatMap((candidate) =>
              candidate.histogram.map((votingPower, grade) => ({
                candidateId: candidate.candidateId,
                grade,
                votingPower
              }))
            ),
            result: {
              computedAt: now,
              totalVotingPower: result.totalVotingPower,
              quorumXrd: result.quorumXrd,
              quorumMet: result.quorumMet,
              minimumMedianGrade: result.minimumMedianGrade,
              candidateResults: result.candidateResults,
              seatedCandidateIds: result.seatedCandidateIds,
              reserveCandidateIds: result.reserveCandidateIds,
              reserveExpiresAt: result.reserveExpiresAt,
              referredSeats: result.referredSeats,
              tieBreakIterations: result.tieBreakIterations,
              unresolvedCandidateIds: result.unresolvedCandidateIds,
              status: result.status
            }
          })
        }
      )

      const finalize = Effect.fn('MajorityJudgmentFinalizer.finalize')(
        function* (watermark: MajorityJudgmentLedgerWatermark) {
          const now = watermark.proposerRoundTimestamp
          const projected = yield* repo.getActiveElectionRounds()
          const roundsByElection = new Map<
            number,
            Array<(typeof projected)[number]>
          >()
          for (const item of projected) {
            const current = roundsByElection.get(item.election.id) ?? []
            current.push(item)
            roundsByElection.set(item.election.id, current)
          }
          const elections = [...roundsByElection.values()].map((rounds) =>
            [...rounds].sort(
              (left, right) => left.round.round - right.round.round
            )
          )

          // A rerun can be started on-ledger the moment Round 1's deadline passes,
          // which can be before the collector ever finalized Round 1. Close every
          // superseded round as well, or its official tally is never recorded.
          yield* Effect.forEach(
            elections,
            Effect.fn('MajorityJudgmentFinalizer.finalizeElection')(
              function* (rounds) {
                const latest = rounds[rounds.length - 1]
                if (latest === undefined) return
                for (const { election, round } of rounds) {
                  if (round.round === latest.round.round) continue
                  if (now < round.votingEnd) continue
                  yield* closeRound(election, round, now, false)
                }

                const { election, round } = latest
                if (now < election.reviewStart) {
                  yield* repo.setPhaseStatus(
                    election.id,
                    round.round,
                    'PENDING'
                  )
                  return
                }
                if (now < election.reviewEnd) {
                  yield* repo.setPhaseStatus(
                    election.id,
                    round.round,
                    'REVIEW_OPEN'
                  )
                  return
                }
                if (now < round.votingStart) {
                  yield* repo.setPhaseStatus(
                    election.id,
                    round.round,
                    round.round === 1 ? 'REVIEW_OPEN' : 'RERUN_PENDING'
                  )
                  return
                }
                if (now < round.votingEnd) {
                  yield* repo.setPhaseStatus(
                    election.id,
                    round.round,
                    round.round === 1 ? 'LIVE' : 'RERUN_LIVE'
                  )
                  return
                }

                yield* Effect.logDebug(
                  'Finalizing from drained ledger watermark',
                  {
                    electionId: election.id,
                    round: round.round,
                    stateVersion: watermark.stateVersion,
                    proposerRoundTimestamp:
                      watermark.proposerRoundTimestamp.toISOString()
                  }
                )
                yield* closeRound(election, round, now, true)
              }
            ),
            { concurrency: 1 }
          )
        }
      )

      const resolveTie = Effect.fn('MajorityJudgmentFinalizer.resolveTie')(
        function* (input: {
          readonly electionId: number
          readonly round: 'RoundOne' | 'Rerun'
          readonly orderedCandidateIds: ReadonlyArray<number>
          readonly recordedAt: Date
        }) {
          const numericRound = input.round === 'RoundOne' ? 1 : 2
          const [round, result, response] = yield* Effect.all([
            repo.getRound(input.electionId, numericRound),
            repo.getResult(input.electionId, numericRound),
            repo.getElectionResponse(input.electionId)
          ])
          if (Option.isSome(result) && result.value.status === 'FINAL') {
            yield* Effect.logDebug(
              'Majority Judgment tie resolution already applied',
              {
                electionId: input.electionId,
                round: numericRound
              }
            )
            return
          }
          const unresolvedResult = yield* Option.match(result, {
            onNone: () =>
              Effect.fail(
                new InvalidMajorityJudgmentTieResolutionError({
                  electionId: input.electionId,
                  round: numericRound,
                  reason: 'No calculated result exists for the recorded round'
                })
              ),
            onSome: (current) =>
              current.status === 'TIE_UNRESOLVED'
                ? Effect.succeed(current)
                : Effect.fail(
                    new InvalidMajorityJudgmentTieResolutionError({
                      electionId: input.electionId,
                      round: numericRound,
                      reason: `Expected TIE_UNRESOLVED, found ${current.status}`
                    })
                  )
          })
          const minimumMedianGrade = yield* Schema.decodeUnknown(GradeSchema)(
            unresolvedResult.minimumMedianGrade
          )
          const resolved = yield* Effect.try({
            try: () =>
              applyMajorityJudgmentTieResolution({
                result: {
                  status: 'TIE_UNRESOLVED',
                  totalVotingPower: unresolvedResult.totalVotingPower,
                  quorumXrd: unresolvedResult.quorumXrd,
                  quorumMet: unresolvedResult.quorumMet,
                  minimumMedianGrade,
                  candidateResults: [...unresolvedResult.candidateResults],
                  seatedCandidateIds: [...unresolvedResult.seatedCandidateIds],
                  reserveCandidateIds: [
                    ...unresolvedResult.reserveCandidateIds
                  ],
                  reserveExpiresAt: unresolvedResult.reserveExpiresAt,
                  referredSeats: unresolvedResult.referredSeats,
                  tieBreakIterations: unresolvedResult.tieBreakIterations,
                  unresolvedCandidateIds: [
                    ...unresolvedResult.unresolvedCandidateIds
                  ]
                },
                orderedCandidateIds: input.orderedCandidateIds,
                seatCount: response.election.seatCount,
                roundEndsAt: round.votingEnd,
                reserveListDays: response.election.reserveListDays
              }),
            catch: (cause) =>
              new InvalidMajorityJudgmentTieResolutionError({
                electionId: input.electionId,
                round: numericRound,
                reason:
                  cause instanceof Error
                    ? cause.message
                    : 'Recorded tie order is invalid'
              })
          })

          yield* repo.commitCalculation({
            electionId: input.electionId,
            round: numericRound,
            lastVoteCount: round.lastVoteCount,
            allowTieResolution: true,
            ballots: [],
            histograms: resolved.candidateResults.flatMap((candidate) =>
              candidate.histogram.map((votingPower, grade) => ({
                candidateId: candidate.candidateId,
                grade,
                votingPower
              }))
            ),
            result: {
              computedAt: input.recordedAt,
              totalVotingPower: resolved.totalVotingPower,
              quorumXrd: resolved.quorumXrd,
              quorumMet: resolved.quorumMet,
              minimumMedianGrade: resolved.minimumMedianGrade,
              candidateResults: resolved.candidateResults,
              seatedCandidateIds: resolved.seatedCandidateIds,
              reserveCandidateIds: resolved.reserveCandidateIds,
              reserveExpiresAt: resolved.reserveExpiresAt,
              referredSeats: resolved.referredSeats,
              tieBreakIterations: resolved.tieBreakIterations,
              unresolvedCandidateIds: resolved.unresolvedCandidateIds,
              status: resolved.status
            }
          })
        }
      )

      return { finalize, resolveTie }
    })
  }
) {}
