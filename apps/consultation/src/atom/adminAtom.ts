import { Atom } from '@effect-atom/atom-react'
import { AccountAddress } from '@radix-effects/shared'
import { Effect, Option } from 'effect'
import type {
  ProposalId,
  TemperatureCheckId
} from 'shared/governance/brandedTypes'
import type {
  MajorityJudgmentCandidateId,
  MajorityJudgmentElectionId,
  MajorityJudgmentRoundId
} from 'shared/governance/index'
import { AdminBadgeService, GovernanceComponent } from 'shared/governance/index'
import { governanceRuntime } from '@/atom/governanceRuntime'
import { SendTransaction } from '@/lib/dappToolkit'
import { getConnectedAccountAddress } from '@/lib/selectedAccount'
import { majorityJudgmentElectionAtom } from './majorityJudgmentAtom'
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

export const promoteToMajorityJudgmentElectionAtom = governanceRuntime.fn(
  Effect.fn(
    function* (
      input: {
        readonly temperatureCheckId: TemperatureCheckId
        readonly reviewStart: Date
        readonly candidateIds: ReadonlyArray<MajorityJudgmentCandidateId>
        readonly candidateOrder: ReadonlyArray<MajorityJudgmentCandidateId>
      },
      get
    ) {
      const governance = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const accountAddress = yield* getConnectedAccountAddress()
      const manifest = yield* governance.makeMajorityJudgmentElectionManifest({
        accountAddress,
        temperatureCheckId: input.temperatureCheckId,
        reviewStart: input.reviewStart,
        candidateIds: input.candidateIds,
        candidateOrder: input.candidateOrder
      })
      const result = yield* sendTransaction(
        manifest,
        `Creating Majority Judgment election from TC #${input.temperatureCheckId}`
      )
      get.refresh(getTemperatureCheckByIdAtom(input.temperatureCheckId))
      return result
    },
    withToast({
      whenLoading: 'Creating Majority Judgment election...',
      whenSuccess: 'Majority Judgment election created',
      whenFailure: transactionFailureMessage(
        'Failed to create Majority Judgment election'
      )
    })
  )
)

export const startMajorityJudgmentRerunAtom = governanceRuntime.fn(
  Effect.fn(
    function* (
      input: {
        readonly electionId: MajorityJudgmentElectionId
        readonly votingStart: Date
      },
      get
    ) {
      const governance = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const accountAddress = yield* getConnectedAccountAddress()
      const manifest = yield* governance.startMajorityJudgmentRerunManifest({
        accountAddress,
        electionId: input.electionId,
        votingStart: input.votingStart
      })
      const result = yield* sendTransaction(
        manifest,
        `Starting rerun for Majority Judgment election #${input.electionId}`
      )
      get.refresh(majorityJudgmentElectionAtom(input.electionId))
      return result
    },
    withToast({
      whenLoading: 'Starting election rerun...',
      whenSuccess: 'Election rerun scheduled',
      whenFailure: transactionFailureMessage('Failed to start election rerun')
    })
  )
)

export const recordMajorityJudgmentTieResolutionAtom = governanceRuntime.fn(
  Effect.fn(
    function* (
      input: {
        readonly electionId: MajorityJudgmentElectionId
        readonly round: MajorityJudgmentRoundId
        readonly orderedCandidateIds: ReadonlyArray<MajorityJudgmentCandidateId>
      },
      get
    ) {
      const governance = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const accountAddress = yield* getConnectedAccountAddress()
      const manifest =
        yield* governance.recordMajorityJudgmentTieResolutionManifest({
          accountAddress,
          electionId: input.electionId,
          round: input.round,
          orderedCandidateIds: input.orderedCandidateIds
        })
      const result = yield* sendTransaction(
        manifest,
        `Recording tie resolution for Majority Judgment election #${input.electionId}`
      )
      get.refresh(majorityJudgmentElectionAtom(input.electionId))
      return result
    },
    withToast({
      whenLoading: 'Recording tie resolution...',
      whenSuccess: 'Tie resolution recorded',
      whenFailure: transactionFailureMessage('Failed to record tie resolution')
    })
  )
)

export const toggleMajorityJudgmentElectionHiddenAtom = governanceRuntime.fn(
  Effect.fn(
    function* (electionId: MajorityJudgmentElectionId, get) {
      const governance = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const accountAddress = yield* getConnectedAccountAddress()
      const manifest =
        yield* governance.makeToggleMajorityJudgmentElectionHiddenManifest({
          accountAddress,
          electionId
        })
      const result = yield* sendTransaction(
        manifest,
        `Toggling visibility for Majority Judgment election #${electionId}`
      )
      get.refresh(majorityJudgmentElectionAtom(electionId))
      return result
    },
    withToast({
      whenLoading: 'Updating election visibility...',
      whenSuccess: 'Election visibility updated',
      whenFailure: transactionFailureMessage(
        'Failed to update election visibility'
      )
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
