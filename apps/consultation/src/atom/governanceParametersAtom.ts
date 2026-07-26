import { AccountAddress } from '@radix-effects/shared'
import { ConfigProvider, Effect, Layer, Option, ParseResult } from 'effect'
import { GatewayApiClientLayer } from 'shared/gateway'
import {
  GovernanceComponent,
  GovernanceConfigLayer
} from 'shared/governance/index'
import type {
  GovernanceParameterSetId,
  GovernanceParameterSetInput
} from 'shared/governance/schemas'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'
import {
  RadixDappToolkit,
  SendTransaction,
  WalletErrorResponse
} from '@/lib/dappToolkit'
import { envVars } from '@/lib/envVars'
import { getCurrentAccount } from '@/lib/selectedAccount'
import { NoAccountConnectedError } from './temperatureChecksAtom'
import { withToast } from './withToast'

const runtime = makeAtomRuntime(
  Layer.mergeAll(GovernanceComponent.Default, SendTransaction.Default).pipe(
    Layer.provideMerge(RadixDappToolkit.Live),
    Layer.provideMerge(GatewayApiClientLayer),
    Layer.provideMerge(GovernanceConfigLayer),
    Layer.provide(Layer.setConfigProvider(ConfigProvider.fromJson(envVars)))
  )
)

export const governanceParameterSetsAtom = runtime.atom(
  Effect.gen(function* () {
    const governanceComponent = yield* GovernanceComponent
    return yield* governanceComponent.getGovernanceParameterSets()
  })
)

type ParameterSetMutationInput = GovernanceParameterSetInput & {
  parameterSetId: GovernanceParameterSetId
}

const getConnectedAccountAddress = Effect.gen(function* () {
  const currentAccount = yield* getCurrentAccount

  if (Option.isNone(currentAccount)) {
    return yield* new NoAccountConnectedError({
      message: 'Please connect your wallet first'
    })
  }

  return AccountAddress.make(currentAccount.value.address)
})

export const addGovernanceParameterSetAtom = runtime.fn(
  Effect.fn(
    function* (input: ParameterSetMutationInput, get) {
      const governanceComponent = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const accountAddress = yield* getConnectedAccountAddress
      const manifest =
        yield* governanceComponent.makeAddGovernanceParameterSetManifest({
          accountAddress,
          ...input
        })
      const result = yield* sendTransaction(
        manifest,
        `Adding governance parameter set ${input.parameterSetId}`
      )

      get.refresh(governanceParameterSetsAtom)
      return result
    },
    withToast({
      whenLoading: 'Adding governance parameter set...',
      whenSuccess: 'Governance parameter set added',
      whenFailure: ({ cause }) => {
        if (cause._tag === 'Fail') {
          if (cause.error instanceof WalletErrorResponse) {
            return Option.some(cause.error.message ?? 'Wallet error')
          }
          if (cause.error instanceof NoAccountConnectedError) {
            return Option.some(cause.error.message)
          }
          if (cause.error instanceof ParseResult.ParseError) {
            return Option.some(`Invalid parameter set: ${cause.error.message}`)
          }
        }
        return Option.some('Failed to add governance parameter set')
      }
    })
  )
)

export const updateGovernanceParameterSetAtom = runtime.fn(
  Effect.fn(
    function* (input: ParameterSetMutationInput, get) {
      const governanceComponent = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const accountAddress = yield* getConnectedAccountAddress
      const manifest =
        yield* governanceComponent.makeUpdateGovernanceParameterSetManifest({
          accountAddress,
          ...input
        })
      const result = yield* sendTransaction(
        manifest,
        `Updating governance parameter set ${input.parameterSetId}`
      )

      get.refresh(governanceParameterSetsAtom)
      return result
    },
    withToast({
      whenLoading: 'Updating governance parameter set...',
      whenSuccess: 'Governance parameter set updated',
      whenFailure: ({ cause }) => {
        if (cause._tag === 'Fail') {
          if (cause.error instanceof WalletErrorResponse) {
            return Option.some(cause.error.message ?? 'Wallet error')
          }
          if (cause.error instanceof NoAccountConnectedError) {
            return Option.some(cause.error.message)
          }
          if (cause.error instanceof ParseResult.ParseError) {
            return Option.some(`Invalid parameter set: ${cause.error.message}`)
          }
        }
        return Option.some('Failed to update governance parameter set')
      }
    })
  )
)

export const retireGovernanceParameterSetAtom = runtime.fn(
  Effect.fn(
    function* (parameterSetId: GovernanceParameterSetId, get) {
      const governanceComponent = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const accountAddress = yield* getConnectedAccountAddress
      const manifest =
        yield* governanceComponent.makeRetireGovernanceParameterSetManifest({
          accountAddress,
          parameterSetId
        })
      const result = yield* sendTransaction(
        manifest,
        `Retiring governance parameter set ${parameterSetId}`
      )

      get.refresh(governanceParameterSetsAtom)
      return result
    },
    withToast({
      whenLoading: 'Retiring governance parameter set...',
      whenSuccess: 'Governance parameter set retired',
      whenFailure: ({ cause }) => {
        if (cause._tag === 'Fail') {
          if (cause.error instanceof WalletErrorResponse) {
            return Option.some(cause.error.message ?? 'Wallet error')
          }
          if (cause.error instanceof NoAccountConnectedError) {
            return Option.some(cause.error.message)
          }
        }
        return Option.some('Failed to retire governance parameter set')
      }
    })
  )
)
