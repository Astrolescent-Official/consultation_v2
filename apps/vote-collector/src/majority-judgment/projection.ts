import { Data, Effect, Option } from 'effect'
import {
  type MajorityJudgmentElection,
  GovernanceComponent,
  type MajorityJudgmentElectionStatus
} from 'shared/governance/index'
import { MajorityJudgmentRepo } from './repo'

export type MajorityJudgmentPhaseBoundaries = {
  readonly reviewStart: Date
  readonly reviewEnd: Date
  readonly votingStart: Date
  readonly votingEnd: Date
}

export const deriveMajorityJudgmentPhase = (
  now: Date,
  boundaries: MajorityJudgmentPhaseBoundaries
): MajorityJudgmentElectionStatus => {
  if (now < boundaries.reviewStart) return 'PENDING'
  if (now < boundaries.reviewEnd) return 'REVIEW_OPEN'
  if (now >= boundaries.votingStart && now < boundaries.votingEnd) {
    return 'LIVE'
  }
  return 'RERUN_PENDING'
}

export const deriveMajorityJudgmentRerunPhase = (
  now: Date,
  votingStart: Date,
  _votingEnd: Date
): MajorityJudgmentElectionStatus => {
  if (now < votingStart) return 'RERUN_PENDING'
  // Deadline finalization owns the transition to FINAL, TIE_UNRESOLVED, or
  // FAILED. Keeping the projected phase active ensures an event observed
  // after the deadline cannot make the finalizer skip this round.
  return 'RERUN_LIVE'
}

const deriveElectionStatus = (
  now: Date,
  election: MajorityJudgmentElection
): MajorityJudgmentElectionStatus =>
  Option.match(election.rerun, {
    onNone: () =>
      deriveMajorityJudgmentPhase(now, {
        reviewStart: election.reviewStart,
        reviewEnd: election.reviewEnd,
        votingStart: election.roundOne.start,
        votingEnd: election.roundOne.deadline
      }),
    onSome: (rerun) =>
      deriveMajorityJudgmentRerunPhase(now, rerun.start, rerun.deadline)
  })

export class InvalidMajorityJudgmentProjectionError extends Data.TaggedError(
  'InvalidMajorityJudgmentProjectionError'
)<{
  readonly electionId: number
  readonly reason: string
}> {}

export class MajorityJudgmentProjection extends Effect.Service<MajorityJudgmentProjection>()(
  'MajorityJudgmentProjection',
  {
    dependencies: [MajorityJudgmentRepo.Default, GovernanceComponent.Default],
    effect: Effect.gen(function* () {
      const repo = yield* MajorityJudgmentRepo
      const governance = yield* GovernanceComponent

      return Effect.fn('MajorityJudgmentProjection.sync')(function* (
        electionId: number,
        observedAt: Date,
        stateVersion: number
      ) {
        const election = yield* governance.getMajorityJudgmentElectionById(
          electionId,
          {
            state_version: stateVersion
          }
        )
        if (election.parameterSet.parameters._tag !== 'MajorityJudgment') {
          return yield* new InvalidMajorityJudgmentProjectionError({
            electionId,
            reason: 'Election must contain a Majority Judgment parameter set'
          })
        }

        const status = deriveElectionStatus(observedAt, election)
        const makeRound = (
          round: MajorityJudgmentElection['roundOne'],
          roundNumber: 1 | 2,
          roundStatus: MajorityJudgmentElectionStatus
        ) => ({
          electionId,
          round: roundNumber,
          snapshotAt: round.snapshot,
          votingStart: round.start,
          votingEnd: round.deadline,
          quorumXrd: round.quorum,
          minimumMedianGrade: round.minimumMedianGrade,
          votesKvsAddress: String(round.votes),
          votersKvsAddress: String(round.voters),
          status: roundStatus
        })

        yield* repo.projectElection({
          election: {
            id: electionId,
            temperatureCheckId: Number(election.temperatureCheckId),
            roleId: election.roleId,
            title: election.title,
            shortDescription: election.shortDescription,
            description: election.description,
            seatCount: election.seatCount,
            reviewStart: election.reviewStart,
            reviewEnd: election.reviewEnd,
            parameterSetId: election.parameterSet.id,
            parameterSetVersion: election.parameterSet.version,
            reserveListDays:
              election.parameterSet.parameters.election.reserveListDays,
            status,
            hidden: election.hidden,
            createdAt: observedAt
          },
          candidates: election.candidates.map((candidate) => ({
            electionId,
            candidateId: Number(candidate.id),
            reference: candidate.reference,
            displayName: candidate.displayName,
            description: candidate.description,
            links: candidate.links,
            displayOrder: candidate.displayOrder
          })),
          round: makeRound(
            election.roundOne,
            1,
            status === 'RERUN_LIVE' ? 'RERUN_PENDING' : status
          )
        })

        yield* Option.match(election.rerun, {
          onNone: () => Effect.void,
          onSome: (rerun) => repo.projectRound(makeRound(rerun, 2, status))
        })

        const activeRound = Option.isSome(election.rerun) ? 2 : 1
        yield* repo.setPhaseStatus(electionId, activeRound, status)

        return election
      })
    })
  }
) {}
