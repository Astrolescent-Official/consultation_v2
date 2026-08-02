import { Atom } from '@effect-atom/atom-react'
import { AccountAddress } from '@radix-effects/shared'
import type { WalletDataStateAccount } from '@radixdlt/radix-dapp-toolkit'
import { Data, Effect, Option } from 'effect'
import {
  GovernanceComponent,
  type Grade,
  type MajorityJudgmentCandidateId,
  type MajorityJudgmentElectionId,
  type MajorityJudgmentRoundId
} from 'shared/governance/index'
import { governanceRuntime } from '@/atom/governanceRuntime'
import { SendTransaction } from '@/lib/dappToolkit'
import {
  batchTransactionToast,
  transactionErrorMessage
} from '@/lib/walletError'
import { accountsAtom } from './dappToolkitAtom'
import { VoteClient, voteClientRuntime } from './voteClient'
import { transactionFailureMessage, withToast } from './withToast'

export const majorityJudgmentElectionsAtom = governanceRuntime.atom(
  Effect.gen(function* () {
    const governance = yield* GovernanceComponent
    // Fetch both KV stores in full rather than one getTemperatureCheckById
    // call per election, which would issue an extra Gateway round trip for
    // every election on every load of the public elections list.
    const [elections, temperatureChecks] = yield* Effect.all(
      [
        governance.getMajorityJudgmentElections(),
        governance.getTemperatureChecks()
      ],
      { concurrency: 2 }
    )
    const temperatureCheckById = new Map(
      temperatureChecks.map((temperatureCheck) => [
        temperatureCheck.id,
        temperatureCheck
      ])
    )

    return elections.flatMap((election) => {
      const temperatureCheck = temperatureCheckById.get(
        election.temperatureCheckId
      )
      // Every on-chain election is created atomically with its linked MJ
      // temperature check, so this should be unreachable. Skip the affected
      // election rather than failing the whole list for every viewer if
      // that invariant is ever violated.
      if (
        temperatureCheck === undefined ||
        temperatureCheck.followUp._tag !== 'MajorityJudgmentElection'
      ) {
        return []
      }
      return [
        {
          ...election,
          title: temperatureCheck.title,
          shortDescription: temperatureCheck.shortDescription,
          roleId: temperatureCheck.followUp.roleId,
          seatCount: temperatureCheck.followUp.seatCount,
          parameterSet: temperatureCheck.parameterSet,
          tcVotingStart: temperatureCheck.start,
          tcVotingEnd: temperatureCheck.deadline,
          tcOutcome: temperatureCheck.outcome
        }
      ]
    })
  })
)

export const majorityJudgmentElectionAtom = Atom.family(
  (electionId: MajorityJudgmentElectionId) =>
    voteClientRuntime.atom(
      Effect.gen(function* () {
        const client = yield* VoteClient
        return yield* client.GetMajorityJudgmentElection({ electionId })
      })
    )
)

export class InvalidMajorityJudgmentRoundParametersError extends Data.TaggedError(
  'InvalidMajorityJudgmentRoundParametersError'
)<{ readonly electionId: MajorityJudgmentElectionId }> {}

export const getMajorityJudgmentRoundDurations = Effect.fn(
  'getMajorityJudgmentRoundDurations'
)(function* (electionId: MajorityJudgmentElectionId) {
  const governance = yield* GovernanceComponent
  const election = yield* governance.getMajorityJudgmentElectionById(electionId)
  const temperatureCheck = yield* governance.getTemperatureCheckById(
    election.temperatureCheckId
  )
  if (temperatureCheck.parameterSet.parameters._tag !== 'MajorityJudgment') {
    return yield* new InvalidMajorityJudgmentRoundParametersError({
      electionId
    })
  }
  return {
    votingDays: temperatureCheck.parameterSet.parameters.election.votingDays,
    rerunVotingDays:
      temperatureCheck.parameterSet.parameters.election.rerunVotingDays
  }
})

export const majorityJudgmentRoundDurationsAtom = Atom.family(
  (electionId: MajorityJudgmentElectionId) =>
    governanceRuntime.atom(getMajorityJudgmentRoundDurations(electionId))
)

export const majorityJudgmentVoterEntriesAtom = Atom.family(
  (electionId: MajorityJudgmentElectionId) =>
    governanceRuntime.atom(
      Effect.fnUntraced(function* (get) {
        const accounts = yield* get.result(accountsAtom)
        const governance = yield* GovernanceComponent
        const election =
          yield* governance.getMajorityJudgmentElectionById(electionId)
        const round = Option.orElse(election.rerun, () => election.roundOne)
        if (Option.isNone(round)) return []
        const entries =
          yield* governance.getMajorityJudgmentVoterEntriesByAccounts({
            keyValueStoreAddress: round.value.voters,
            accounts: accounts.map(({ address }) =>
              AccountAddress.make(address)
            )
          })
        return entries.map((entry) => ({
          ...entry,
          label:
            accounts.find(({ address }) => address === entry.accountAddress)
              ?.label ?? 'Unknown account'
        }))
      })
    )
)

type BatchVoteResult = {
  readonly account: string
  readonly success: boolean
  readonly error?: string
}

export const voteOnMajorityJudgmentBatchAtom = governanceRuntime.fn(
  Effect.fn(
    function* (
      input: {
        readonly accounts: ReadonlyArray<WalletDataStateAccount>
        readonly electionId: MajorityJudgmentElectionId
        readonly round: MajorityJudgmentRoundId
        readonly candidateIds: ReadonlyArray<MajorityJudgmentCandidateId>
        readonly grades: ReadonlyArray<{
          readonly candidateId: MajorityJudgmentCandidateId
          readonly grade: Grade
        }>
      },
      get
    ) {
      const governance = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const results: Array<BatchVoteResult> = []

      for (const account of input.accounts) {
        const result = yield* governance
          .makeMajorityJudgmentVoteManifest({
            accountAddress: AccountAddress.make(account.address),
            electionId: input.electionId,
            round: input.round,
            candidateIds: input.candidateIds,
            grades: input.grades
          })
          .pipe(
            Effect.flatMap((manifest) =>
              sendTransaction(
                manifest,
                `Submitting Majority Judgment ballot for election #${input.electionId}`
              )
            ),
            Effect.as<BatchVoteResult>({
              account: account.address,
              success: true
            }),
            Effect.catchAll((error) =>
              Effect.succeed<BatchVoteResult>({
                account: account.address,
                success: false,
                error: transactionErrorMessage(error, 'Vote failed')
              })
            )
          )
        results.push(result)
      }

      if (results.some(({ success }) => success)) {
        get.refresh(majorityJudgmentVoterEntriesAtom(input.electionId))
        get.refresh(majorityJudgmentElectionAtom(input.electionId))
      }
      return results
    },
    withToast({
      whenLoading: 'Submitting Majority Judgment ballot...',
      whenSuccess: ({ result }) => batchTransactionToast(result, 'ballot'),
      whenFailure: transactionFailureMessage(
        'Failed to submit Majority Judgment ballot'
      )
    })
  )
)
