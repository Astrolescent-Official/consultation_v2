import { Data, Effect, Option } from 'effect'
import {
  GovernanceComponent,
  type MajorityJudgmentElection,
  type MajorityJudgmentElectionStatus,
  type TemperatureCheck
} from 'shared/governance/index'
import { MajorityJudgmentRepo } from './repo'

export type MajorityJudgmentPhaseBoundaries = {
  readonly tcVotingStart: Date
  readonly tcVotingEnd: Date
  readonly votingStart: Date
  readonly votingEnd: Date
  readonly tcOutcome: 'PENDING' | 'PASSED' | 'FAILED'
}

export const deriveAuthoritativeTemperatureCheckOutcome = (
  recorded: 'PENDING' | 'PASSED' | 'FAILED',
  calculatedPassed: boolean
): 'PENDING' | 'PASSED' | 'FAILED' => {
  if (!calculatedPassed) return 'FAILED'
  return recorded === 'PASSED' ? 'PASSED' : recorded
}

export const deriveMajorityJudgmentPhase = (
  now: Date,
  boundaries: MajorityJudgmentPhaseBoundaries
): MajorityJudgmentElectionStatus => {
  if (boundaries.tcOutcome === 'FAILED') return 'TC_FAILED'
  if (boundaries.tcOutcome === 'PENDING') {
    return now < boundaries.tcVotingStart ? 'PENDING' : 'TC_LIVE'
  }
  if (now < boundaries.votingStart) return 'MJ_PENDING'
  if (now >= boundaries.votingStart && now < boundaries.votingEnd) {
    return 'LIVE'
  }
  // Deadline finalization determines whether this is a successful result or a
  // quorum failure. Keep the phase active until that calculation is recorded;
  // only the finalizer may enter ROUND_1_FAILED.
  return 'LIVE'
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

export const deriveRoundOneProjectedStatus = (
  _rerunStarted: boolean,
  status: MajorityJudgmentElectionStatus
): MajorityJudgmentElectionStatus => status

const deriveElectionStatus = (
  now: Date,
  election: MajorityJudgmentElection,
  temperatureCheck: TemperatureCheck
): MajorityJudgmentElectionStatus =>
  Option.match(election.rerun, {
    onNone: () =>
      deriveMajorityJudgmentPhase(now, {
        tcVotingStart: temperatureCheck.start,
        tcVotingEnd: temperatureCheck.deadline,
        votingStart: election.roundOne.start,
        votingEnd: election.roundOne.deadline,
        tcOutcome: Option.match(temperatureCheck.outcome, {
          onNone: () => 'PENDING' as const,
          onSome: (outcome) =>
            outcome.passed ? ('PASSED' as const) : ('FAILED' as const)
        })
      }),
    onSome: (rerun) => {
      const recordedTcPassed = Option.exists(
        temperatureCheck.outcome,
        (outcome) => outcome.passed
      )
      return recordedTcPassed
        ? deriveMajorityJudgmentRerunPhase(now, rerun.start, rerun.deadline)
        : 'TC_FAILED'
    }
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
        const temperatureCheck = yield* governance.getTemperatureCheckById(
          election.temperatureCheckId,
          { state_version: stateVersion }
        )
        if (
          temperatureCheck.parameterSet.parameters._tag !== 'MajorityJudgment'
        ) {
          return yield* new InvalidMajorityJudgmentProjectionError({
            electionId,
            reason: 'Election must contain a Majority Judgment parameter set'
          })
        }
        if (temperatureCheck.followUp._tag !== 'MajorityJudgmentElection') {
          return yield* new InvalidMajorityJudgmentProjectionError({
            electionId,
            reason:
              'Election must reference a Majority Judgment temperature check'
          })
        }

        const status = deriveElectionStatus(
          observedAt,
          election,
          temperatureCheck
        )
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
        const rerunStarted = Option.isSome(election.rerun)

        yield* repo.projectElection({
          election: {
            id: electionId,
            temperatureCheckId: Number(election.temperatureCheckId),
            roleId: temperatureCheck.followUp.roleId,
            title: temperatureCheck.title,
            shortDescription: temperatureCheck.shortDescription,
            description: temperatureCheck.description,
            seatCount: temperatureCheck.followUp.seatCount,
            snapshotAt: temperatureCheck.snapshot,
            tcVotingStart: temperatureCheck.start,
            tcVotingEnd: temperatureCheck.deadline,
            tcQuorumXrd:
              temperatureCheck.parameterSet.parameters.temperatureCheck.quorum,
            tcApprovalThreshold:
              temperatureCheck.parameterSet.parameters.temperatureCheck
                .approvalThreshold,
            tcOutcome: Option.match(temperatureCheck.outcome, {
              onNone: () => null,
              onSome: (outcome) => (outcome.passed ? 'PASSED' : 'FAILED')
            }),
            tcOutcomeRecordedAt: Option.match(temperatureCheck.outcome, {
              onNone: () => null,
              onSome: (outcome) => outcome.recordedAt
            }),
            parameterSetId: temperatureCheck.parameterSet.id,
            parameterSetVersion: temperatureCheck.parameterSet.version,
            reserveListDays:
              temperatureCheck.parameterSet.parameters.election.reserveListDays,
            status,
            hidden: election.hidden,
            createdAt: observedAt
          },
          candidates: temperatureCheck.followUp.candidates.map((candidate) => ({
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
            deriveRoundOneProjectedStatus(rerunStarted, status)
          )
        })

        yield* Option.match(election.rerun, {
          onNone: () => Effect.void,
          onSome: (rerun) => repo.projectRound(makeRound(rerun, 2, status))
        })

        const activeRound = rerunStarted ? 2 : 1
        yield* repo.setPhaseStatus(electionId, activeRound, status)

        return election
      })
    })
  }
) {}
