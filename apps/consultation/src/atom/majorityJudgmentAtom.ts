import { Atom } from '@effect-atom/atom-react'
import { AccountAddress } from '@radix-effects/shared'
import type { WalletDataStateAccount } from '@radixdlt/radix-dapp-toolkit'
import { Effect, Option } from 'effect'
import {
  GovernanceComponent,
  type Grade,
  type MajorityJudgmentCandidateId,
  type MajorityJudgmentElectionId,
  type MajorityJudgmentRoundId
} from 'shared/governance/index'
import { governanceRuntime } from '@/atom/governanceRuntime'
import { SendTransaction } from '@/lib/dappToolkit'
import { accountsAtom } from './dappToolkitAtom'
import { VoteClient, voteClientRuntime } from './voteClient'
import { transactionFailureMessage, withToast } from './withToast'

export const majorityJudgmentElectionsAtom = governanceRuntime.atom(
  Effect.gen(function* () {
    const governance = yield* GovernanceComponent
    return yield* governance.getMajorityJudgmentElections()
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

export const majorityJudgmentVoterEntriesAtom = Atom.family(
  (electionId: MajorityJudgmentElectionId) =>
    governanceRuntime.atom(
      Effect.fnUntraced(function* (get) {
        const accounts = yield* get.result(accountsAtom)
        const governance = yield* GovernanceComponent
        const election =
          yield* governance.getMajorityJudgmentElectionById(electionId)
        const round = Option.getOrElse(election.rerun, () => election.roundOne)
        const entries =
          yield* governance.getMajorityJudgmentVoterEntriesByAccounts({
            keyValueStoreAddress: round.voters,
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

const errorMessage = (error: unknown) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return 'Vote failed'
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
                error: errorMessage(error)
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
      whenSuccess: ({ result }) => {
        const succeeded = result.filter(({ success }) => success).length
        const failed = result.length - succeeded
        return failed === 0
          ? `${succeeded} ballot(s) submitted`
          : `${succeeded} submitted, ${failed} failed`
      },
      whenFailure: transactionFailureMessage(
        'Failed to submit Majority Judgment ballot'
      )
    })
  )
)
