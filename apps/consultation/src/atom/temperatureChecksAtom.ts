import { Atom } from '@effect-atom/atom-react'
import { GatewayApiClient } from '@radix-effects/gateway'
import { AccountAddress } from '@radix-effects/shared'
import type { WalletDataStateAccount } from '@radixdlt/radix-dapp-toolkit'
import { Array as A, Data, Effect, Option, pipe } from 'effect'
import {
  GovernanceComponent,
  type TemperatureCheckId
} from 'shared/governance/index'
import type {
  MakeTemperatureCheckInput,
  MakeTemperatureCheckVoteInput
} from 'shared/governance/schemas'
import { parseSbor } from 'shared/helpers/parseSbor'
import {
  type KeyValueStoreAddress,
  TemperatureCheckCreatedEvent
} from 'shared/schemas'
import { governanceRuntime as runtime } from '@/atom/governanceRuntime'
import { SendTransaction } from '@/lib/dappToolkit'
import { getConnectedAccountAddress } from '@/lib/selectedAccount'
import { truncateAddress } from '@/lib/utils'
import {
  batchTransactionToast,
  transactionErrorMessage
} from '@/lib/walletError'
import { accountsAtom } from './dappToolkitAtom'
import { transactionFailureMessage, withToast } from './withToast'

class EventNotFoundError extends Data.TaggedError('EventNotFoundError')<{
  message: string
}> {}

type MakeTemperatureCheckFormInput = Omit<
  MakeTemperatureCheckInput,
  'authorAccount'
>

export const makeTemperatureCheckAtom = runtime.fn(
  Effect.fn(
    function* (input: MakeTemperatureCheckFormInput) {
      const governanceComponent = yield* GovernanceComponent
      const gatewayApiClient = yield* GatewayApiClient
      const sendTransaction = yield* SendTransaction
      const authorAccount = yield* getConnectedAccountAddress()

      const manifest = yield* governanceComponent.makeTemperatureCheckManifest({
        ...input,
        links: input.links.filter((link) => link.trim() !== ''),
        authorAccount
      })

      yield* Effect.log('Transaction manifest:', manifest)

      const message = `Creating TC ${input.title} with ${truncateAddress(authorAccount)}`
      const result = yield* sendTransaction(manifest, message)

      const events = yield* gatewayApiClient.transaction
        .getCommittedDetails(result.transactionIntentHash)
        .pipe(
          Effect.map((result) =>
            Option.fromNullable(result.transaction.receipt?.events)
          )
        )

      const temperatureCheckCreatedEvent = yield* pipe(
        events,
        Option.flatMap((events) =>
          A.findFirst(
            events,
            (event) => event.name === 'TemperatureCheckCreatedEvent'
          )
        ),
        Option.map((event) => event.data),
        Option.match({
          onSome: (sbor) => parseSbor(sbor, TemperatureCheckCreatedEvent),
          onNone: () =>
            Effect.fail(
              new EventNotFoundError({
                message: 'TemperatureCheckCreatedEvent not found'
              })
            )
        })
      )

      return temperatureCheckCreatedEvent
    },
    withToast({
      whenLoading: 'Making temperature check...',
      whenSuccess: 'Temperature check made successfully',
      whenFailure: transactionFailureMessage('Failed to make temperature check')
    })
  )
)

class AccountAlreadyVotedError extends Data.TaggedError(
  'AccountAlreadyVotedError'
)<{
  message: string
}> {}

const componentErrorMessage = {
  accountAlreadyVoted: 'accountAlreadyVoted'
} as const

// Core vote logic without toast - reused by both single and batch atoms
const voteOnTemperatureCheck = (input: MakeTemperatureCheckVoteInput) =>
  Effect.gen(function* () {
    const governanceComponent = yield* GovernanceComponent
    const sendTransaction = yield* SendTransaction

    const manifest =
      yield* governanceComponent.makeTemperatureCheckVoteManifest(input)

    const message = `Vote ${input.vote} on TC #${input.temperatureCheckId} with ${truncateAddress(input.accountAddress)}`
    return yield* sendTransaction(manifest, message).pipe(
      Effect.catchTag('WalletErrorResponse', (error) =>
        Effect.gen(function* () {
          if (
            error.message.includes(componentErrorMessage.accountAlreadyVoted)
          ) {
            return yield* new AccountAlreadyVotedError({
              message: 'Account has already voted on this temperature check'
            })
          }
          return yield* error
        })
      )
    )
  })

type VoteResult = { account: string; success: boolean; error?: string }

export const voteOnTemperatureCheckBatchAtom = runtime.fn(
  Effect.fn(
    function* (
      input: {
        accounts: WalletDataStateAccount[]
        temperatureCheckId: TemperatureCheckId
        keyValueStoreAddress: KeyValueStoreAddress
        vote: 'For' | 'Against'
      },
      get
    ) {
      // No pre-filtering: accounts that already voted can change their vote
      const accountsToVote = input.accounts

      const results: VoteResult[] = []

      for (const account of accountsToVote) {
        const result = yield* voteOnTemperatureCheck({
          accountAddress: AccountAddress.make(account.address),
          temperatureCheckId: input.temperatureCheckId,
          vote: input.vote
        }).pipe(
          Effect.map(
            (): VoteResult => ({ account: account.address, success: true })
          ),
          Effect.catchAll((error) =>
            Effect.succeed<VoteResult>({
              account: account.address,
              success: false,
              error: transactionErrorMessage(error, 'Vote failed')
            })
          )
        )
        results.push(result)
      }

      // Refresh votes atom to update UI after successful votes
      const hasSuccessfulVotes = results.some((r) => r.success)
      if (hasSuccessfulVotes) {
        get.refresh(
          getTemperatureCheckVotesByAccountsAtom(input.keyValueStoreAddress)
        )
      }

      return results
    },
    withToast({
      whenLoading: 'Submitting votes...',
      whenSuccess: ({ result }) => batchTransactionToast(result, 'vote'),
      whenFailure: () => Option.some('Failed to submit votes')
    })
  )
)

export const getTemperatureCheckByIdAtom = Atom.family(
  (id: TemperatureCheckId) =>
    runtime.atom(
      Effect.gen(function* () {
        const governanceComponent = yield* GovernanceComponent
        return yield* governanceComponent.getTemperatureCheckById(id)
      })
    )
)

export const getTemperatureCheckVotesByAccountsAtom = Atom.family(
  (keyValueStoreAddress: KeyValueStoreAddress) =>
    runtime.atom(
      Effect.fnUntraced(function* (get) {
        const accounts = yield* get.result(accountsAtom)

        const governanceComponent = yield* GovernanceComponent

        const votes =
          yield* governanceComponent.getTemperatureCheckVotesByAccounts({
            keyValueStoreAddress,
            accounts: accounts.map((account) =>
              AccountAddress.make(account.address)
            )
          })

        return votes.map((vote) => {
          const account = accounts.find((a) => a.address === vote.address)
          return {
            ...vote,
            label: account?.label ?? 'Unknown Account'
          }
        })
      })
    )
)

const PAGE_SIZE = 5

export type SortOrder = 'asc' | 'desc'

export const paginatedTemperatureChecksAtom = Atom.family((page: number) =>
  Atom.family((sortOrder: SortOrder) =>
    runtime.atom(
      Effect.gen(function* () {
        const governanceComponent = yield* GovernanceComponent
        return yield* governanceComponent.getPaginatedTemperatureChecks({
          page,
          pageSize: PAGE_SIZE,
          sortOrder
        })
      })
    )
  )
)
