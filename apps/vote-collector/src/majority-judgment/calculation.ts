import { GetLedgerStateService } from '@radix-effects/gateway'
import { AccountAddress, StateVersion } from '@radix-effects/shared'
import BigNumber from 'bignumber.js'
import { Effect, Schedule } from 'effect'
import type {
  Grade,
  MajorityJudgmentElectionStatus
} from 'shared/governance/index'
import { GovernanceComponent } from 'shared/governance/index'
import { KeyValueStoreAddress } from 'shared/schemas'
import { VotePowerSnapshot } from '../vote-calculation/votePowerSnapshot'
import { getVotePowerConfig } from '../vote-calculation/voteSourceConfig'
import { calculateMajorityJudgment } from './calculator'
import { type MajorityJudgmentBallotWrite, MajorityJudgmentRepo } from './repo'

export type IndexedMajorityJudgmentVote = {
  readonly voteId: number
  readonly accountAddress: string
  readonly grades: ReadonlyArray<{
    readonly candidateId: number
    readonly grade: Grade
  }>
}

export const dedupeMajorityJudgmentVotes = (
  votes: ReadonlyArray<IndexedMajorityJudgmentVote>
) => {
  const latestByAccount = new Map<string, IndexedMajorityJudgmentVote>()
  for (const vote of votes) {
    const current = latestByAccount.get(vote.accountAddress)
    if (current === undefined || vote.voteId > current.voteId) {
      latestByAccount.set(vote.accountAddress, vote)
    }
  }
  return [...latestByAccount.values()].sort((left, right) =>
    left.accountAddress.localeCompare(right.accountAddress)
  )
}

export const prepareMajorityJudgmentBallots = (input: {
  readonly votes: ReadonlyArray<IndexedMajorityJudgmentVote>
  readonly existingBallots: ReadonlyArray<MajorityJudgmentBallotWrite>
  readonly firstTimeVotingPower: Readonly<Record<string, string>>
  readonly castAt: Date
}): ReadonlyArray<MajorityJudgmentBallotWrite> => {
  const existingPower = new Map(
    input.existingBallots.map((ballot) => [
      ballot.accountAddress,
      ballot.votingPower
    ])
  )

  return input.votes.flatMap((vote) => {
    const votingPower =
      existingPower.get(vote.accountAddress) ??
      input.firstTimeVotingPower[vote.accountAddress] ??
      '0'
    if (!new BigNumber(votingPower).isGreaterThan(0)) return []
    return [
      {
        accountAddress: vote.accountAddress,
        voteId: BigInt(vote.voteId),
        grades: vote.grades,
        votingPower: new BigNumber(votingPower).toFixed(),
        castAt: input.castAt
      }
    ]
  })
}

export type MajorityJudgmentCalculationAction = {
  readonly electionId: number
  readonly round: 'RoundOne' | 'Rerun'
  readonly voteCount: number
  readonly observedAt: Date
  readonly stateVersion: number
}

const roundNumber = (round: 'RoundOne' | 'Rerun') =>
  round === 'RoundOne' ? 1 : 2

export class MajorityJudgmentCalculation extends Effect.Service<MajorityJudgmentCalculation>()(
  'MajorityJudgmentCalculation',
  {
    dependencies: [
      MajorityJudgmentRepo.Default,
      GovernanceComponent.Default,
      GetLedgerStateService.Default,
      VotePowerSnapshot.Default
    ],
    effect: Effect.gen(function* () {
      const repo = yield* MajorityJudgmentRepo
      const governance = yield* GovernanceComponent
      const getLedgerState = yield* GetLedgerStateService
      const votePowerSnapshot = yield* VotePowerSnapshot

      return Effect.fn('MajorityJudgmentCalculation.calculate')(function* (
        action: MajorityJudgmentCalculationAction
      ) {
        const numericRound = roundNumber(action.round)
        const round = yield* repo.getRound(action.electionId, numericRound)
        const lastVoteCount = Number(round.lastVoteCount)
        if (action.voteCount <= lastVoteCount) return

        const fetchedVotes = yield* governance.getMajorityJudgmentVotesByIndex({
          keyValueStoreAddress: KeyValueStoreAddress.make(
            round.votesKvsAddress
          ),
          fromIndexInclusive: lastVoteCount,
          toIndexInclusive: action.voteCount - 1,
          atLedgerState: { state_version: action.stateVersion }
        })
        const votes = dedupeMajorityJudgmentVotes(fetchedVotes)
        const accounts = votes.map(({ accountAddress }) => accountAddress)
        const existingBallots = yield* repo.getBallotsByAccounts(
          action.electionId,
          numericRound,
          accounts
        )
        const existingAccounts = new Set(
          existingBallots.map(({ accountAddress }) => accountAddress)
        )
        const firstTimeAccounts = accounts
          .filter((account) => !existingAccounts.has(account))
          .map((account) => AccountAddress.make(account))

        let snapshotStateVersion = round.snapshotStateVersion
        if (snapshotStateVersion === null) {
          const ledgerState = yield* getLedgerState({
            at_ledger_state: { timestamp: round.snapshotAt }
          })
          snapshotStateVersion = BigInt(ledgerState.state_version)
          yield* repo.setSnapshotStateVersion(
            action.electionId,
            numericRound,
            snapshotStateVersion
          )
        }

        const retryPolicy = Schedule.exponential('1 second').pipe(
          Schedule.intersect(Schedule.recurs(3))
        )
        const firstTimeVotingPower =
          firstTimeAccounts.length === 0
            ? {}
            : yield* votePowerSnapshot({
                addresses: [...firstTimeAccounts],
                stateVersion: StateVersion.make(Number(snapshotStateVersion)),
                sourceConfig: getVotePowerConfig(round.snapshotAt)
              }).pipe(
                Effect.retry(retryPolicy),
                Effect.map(({ votePower }) =>
                  Object.fromEntries(
                    Object.entries(votePower).map(([account, power]) => [
                      account,
                      power.toFixed()
                    ])
                  )
                )
              )

        const ballots = prepareMajorityJudgmentBallots({
          votes,
          existingBallots,
          firstTimeVotingPower,
          castAt: action.observedAt
        })
        const allStoredBallots = yield* repo.getBallots(
          action.electionId,
          numericRound
        )
        const finalByAccount = new Map(
          allStoredBallots.map((ballot) => [ballot.accountAddress, ballot])
        )
        for (const ballot of ballots) {
          finalByAccount.set(ballot.accountAddress, {
            electionId: action.electionId,
            round: numericRound,
            ...ballot
          })
        }

        const candidates = yield* repo.getCandidates(action.electionId)
        const election = yield* repo.getElectionResponse(action.electionId)
        const result = calculateMajorityJudgment({
          candidates: candidates.map(({ candidateId }) => ({
            id: candidateId
          })),
          ballots: [...finalByAccount.values()].map((ballot) => ({
            accountAddress: ballot.accountAddress,
            voteId: Number(ballot.voteId),
            votingPower: ballot.votingPower,
            grades: ballot.grades
          })),
          seatCount: election.election.seatCount,
          quorumXrd: round.quorumXrd,
          minimumMedianGrade: round.minimumMedianGrade,
          reserveListDays: election.election.reserveListDays,
          roundEndsAt: round.votingEnd,
          round: action.round
        })
        const status: MajorityJudgmentElectionStatus =
          action.round === 'RoundOne' ? 'LIVE' : 'RERUN_LIVE'

        yield* Effect.logDebug('Calculated live Majority Judgment result', {
          electionId: action.electionId,
          round: action.round,
          voteCount: action.voteCount,
          totalVotingPower: result.totalVotingPower,
          quorumXrd: result.quorumXrd,
          quorumMet: result.quorumMet,
          minimumMedianGrade: result.minimumMedianGrade,
          candidateResults: result.candidateResults,
          seatedCandidateIds: result.seatedCandidateIds,
          reserveCandidateIds: result.reserveCandidateIds,
          referredSeats: result.referredSeats,
          tieBreakIterations: result.tieBreakIterations,
          unresolvedCandidateIds: result.unresolvedCandidateIds
        })

        yield* repo.commitCalculation({
          electionId: action.electionId,
          round: numericRound,
          lastVoteCount: BigInt(action.voteCount),
          ballots,
          histograms: result.candidateResults.flatMap((candidate) =>
            candidate.histogram.map((votingPower, grade) => ({
              candidateId: candidate.candidateId,
              grade,
              votingPower
            }))
          ),
          result: {
            computedAt: action.observedAt,
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
            status
          }
        })
      })
    })
  }
) {}
