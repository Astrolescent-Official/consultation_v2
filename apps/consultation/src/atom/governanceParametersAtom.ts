import { Atom } from '@effect-atom/atom-react'
import { Effect } from 'effect'
import { GovernanceComponent } from 'shared/governance/index'
import type {
  GovernanceParameterSetId,
  GovernanceParameterSetInput
} from 'shared/governance/schemas'
import { governanceRuntime } from '@/atom/governanceRuntime'
import { SendTransaction } from '@/lib/dappToolkit'
import { getConnectedAccountAddress } from '@/lib/selectedAccount'
import { transactionFailureMessage, withToast } from './withToast'

export const governanceParameterSetsAtom = governanceRuntime.atom(
  Effect.gen(function* () {
    const governanceComponent = yield* GovernanceComponent
    return yield* governanceComponent.getGovernanceParameterSets()
  })
)

export const addGovernanceParameterSetAtom = governanceRuntime.fn(
  Effect.fn(
    function* (
      input: GovernanceParameterSetInput & {
        parameterSetId: GovernanceParameterSetId
      },
      get
    ) {
      const governanceComponent = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const accountAddress = yield* getConnectedAccountAddress()
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
      whenFailure: transactionFailureMessage(
        'Failed to add governance parameter set'
      )
    })
  )
)

/**
 * One atom per parameter set. A single shared atom would make every editor on
 * the admin page show the pending state of whichever set was being saved.
 */
export const updateGovernanceParameterSetAtom = Atom.family(
  (parameterSetId: GovernanceParameterSetId) =>
    governanceRuntime.fn(
      Effect.fn(
        function* (input: GovernanceParameterSetInput, get) {
          const governanceComponent = yield* GovernanceComponent
          const sendTransaction = yield* SendTransaction
          const accountAddress = yield* getConnectedAccountAddress()
          const manifest =
            yield* governanceComponent.makeUpdateGovernanceParameterSetManifest(
              { accountAddress, parameterSetId, ...input }
            )
          const result = yield* sendTransaction(
            manifest,
            `Updating governance parameter set ${parameterSetId}`
          )

          get.refresh(governanceParameterSetsAtom)
          return result
        },
        withToast({
          whenLoading: 'Updating governance parameter set...',
          whenSuccess: 'Governance parameter set updated',
          whenFailure: transactionFailureMessage(
            'Failed to update governance parameter set'
          )
        })
      )
    )
)

export const retireGovernanceParameterSetAtom = Atom.family(
  (parameterSetId: GovernanceParameterSetId) =>
    governanceRuntime.fn(
      Effect.fn(
        // The set to retire comes from the family key, so the atom takes no
        // argument; `undefined` would force callers to pass one explicitly.
        // biome-ignore lint/suspicious/noConfusingVoidType: no-argument atom
        function* (_: void, get) {
          const governanceComponent = yield* GovernanceComponent
          const sendTransaction = yield* SendTransaction
          const accountAddress = yield* getConnectedAccountAddress()
          const manifest =
            yield* governanceComponent.makeRetireGovernanceParameterSetManifest(
              { accountAddress, parameterSetId }
            )
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
          whenFailure: transactionFailureMessage(
            'Failed to retire governance parameter set'
          )
        })
      )
    )
)
