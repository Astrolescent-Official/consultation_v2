import { Atom } from '@effect-atom/atom-react'
import { AccountAddress } from '@radix-effects/shared'
import { Effect, Option } from 'effect'
import type {
  ProposalId,
  TemperatureCheckId
} from 'shared/governance/brandedTypes'
import { AdminBadgeService, GovernanceComponent } from 'shared/governance/index'
import { governanceRuntime } from '@/atom/governanceRuntime'
import { SendTransaction } from '@/lib/dappToolkit'
import { getConnectedAccountAddress } from '@/lib/selectedAccount'
import { getProposalByIdAtom } from './proposalsAtom'
import { getTemperatureCheckByIdAtom } from './temperatureChecksAtom'
import { transactionFailureMessage, withToast } from './withToast'

/** Checks whether a specific account holds the admin badge */
export const isAdminAtom = Atom.family((accountAddress: string) =>
  governanceRuntime.atom(
    Effect.gen(function* () {
      if (!accountAddress) return false

      const adminBadgeService = yield* AdminBadgeService

      return Option.isSome(
        yield* adminBadgeService.getForAccount(
          AccountAddress.make(accountAddress)
        )
      )
    })
  )
)

/** Promotes a temperature check to a proposal */
export const promoteToProposalAtom = governanceRuntime.fn(
  Effect.fn(
    function* (temperatureCheckId: TemperatureCheckId, get) {
      const governanceComponent = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const accountAddress = yield* getConnectedAccountAddress()

      const manifest = yield* governanceComponent.makeProposalManifest({
        accountAddress,
        temperatureCheckId
      })

      yield* Effect.log('Promote to proposal manifest:', manifest)

      const result = yield* sendTransaction(
        manifest,
        `Promoting TC #${temperatureCheckId} to Proposal`
      )

      get.refresh(getTemperatureCheckByIdAtom(temperatureCheckId))

      return result
    },
    withToast({
      whenLoading: 'Promoting to proposal...',
      whenSuccess: 'Temperature check promoted to proposal',
      whenFailure: transactionFailureMessage('Failed to promote to proposal')
    })
  )
)

/** Toggles the hidden state of a temperature check */
export const toggleTemperatureCheckHiddenAtom = governanceRuntime.fn(
  Effect.fn(
    function* (temperatureCheckId: TemperatureCheckId, get) {
      const governanceComponent = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const accountAddress = yield* getConnectedAccountAddress()

      const manifest =
        yield* governanceComponent.makeToggleTemperatureCheckHiddenManifest({
          accountAddress,
          temperatureCheckId
        })

      const result = yield* sendTransaction(
        manifest,
        `Toggling hidden on TC #${temperatureCheckId}`
      )

      get.refresh(getTemperatureCheckByIdAtom(temperatureCheckId))

      return result
    },
    withToast({
      whenLoading: 'Toggling visibility...',
      whenSuccess: 'Visibility updated',
      whenFailure: transactionFailureMessage('Failed to toggle visibility')
    })
  )
)

/** Toggles the hidden state of a proposal */
export const toggleProposalHiddenAtom = governanceRuntime.fn(
  Effect.fn(
    function* (proposalId: ProposalId, get) {
      const governanceComponent = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const accountAddress = yield* getConnectedAccountAddress()

      const manifest =
        yield* governanceComponent.makeToggleProposalHiddenManifest({
          accountAddress,
          proposalId
        })

      const result = yield* sendTransaction(
        manifest,
        `Toggling hidden on GP #${proposalId}`
      )

      get.refresh(getProposalByIdAtom(proposalId))

      return result
    },
    withToast({
      whenLoading: 'Toggling visibility...',
      whenSuccess: 'Visibility updated',
      whenFailure: transactionFailureMessage('Failed to toggle visibility')
    })
  )
)
