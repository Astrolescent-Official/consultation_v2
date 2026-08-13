import { Atom } from '@effect-atom/atom-react'
import { GatewayApiClient } from '@radix-effects/gateway'
import { AccountAddress } from '@radix-effects/shared'
import { Array as A, Data, Effect, Option, pipe, Schema } from 'effect'
import type {
  ProposalId,
  TemperatureCheckId
} from 'shared/governance/brandedTypes'
import type {
  MajorityJudgmentCandidateId,
  MajorityJudgmentElectionId,
  MajorityJudgmentRoundId,
  MakeMajorityJudgmentElectionInput
} from 'shared/governance/index'
import {
  AdminBadgeService,
  canOpenMajorityJudgmentRoundOne,
  canStartMajorityJudgmentRerun,
  GovernanceComponent,
  MajorityJudgmentElectionIdSchema,
  MajorityJudgmentElectionStatusSchema
} from 'shared/governance/index'
import { parseSbor } from 'shared/helpers/parseSbor'
import { MajorityJudgmentElectionCreatedEvent } from 'shared/schemas'
import { governanceRuntime } from '@/atom/governanceRuntime'
import { SendTransaction } from '@/lib/dappToolkit'
import { getConnectedAccountAddress } from '@/lib/selectedAccount'
import { majorityJudgmentElectionAtom } from './majorityJudgmentAtom'
import { getProposalByIdAtom } from './proposalsAtom'
import { getTemperatureCheckByIdAtom } from './temperatureChecksAtom'
import { VoteClient } from './voteClient'
import { transactionFailureMessage, withToast } from './withToast'

class EventNotFoundError extends Data.TaggedError('EventNotFoundError')<{
  message: string
}> {}

export class InvalidMajorityJudgmentRerunStatusError extends Schema.TaggedError<InvalidMajorityJudgmentRerunStatusError>(
  'InvalidMajorityJudgmentRerunStatusError'
)('InvalidMajorityJudgmentRerunStatusError', {
  electionId: MajorityJudgmentElectionIdSchema,
  status: MajorityJudgmentElectionStatusSchema,
  message: Schema.String
}) {}

export class InvalidMajorityJudgmentRoundOneStatusError extends Schema.TaggedError<InvalidMajorityJudgmentRoundOneStatusError>(
  'InvalidMajorityJudgmentRoundOneStatusError'
)('InvalidMajorityJudgmentRoundOneStatusError', {
  electionId: MajorityJudgmentElectionIdSchema,
  status: MajorityJudgmentElectionStatusSchema,
  message: Schema.String
}) {}

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

export const createMajorityJudgmentElectionAtom = governanceRuntime.fn(
  Effect.fn(
    function* (
      input: Omit<MakeMajorityJudgmentElectionInput, 'accountAddress'>
    ) {
      const governance = yield* GovernanceComponent
      const gatewayApiClient = yield* GatewayApiClient
      const sendTransaction = yield* SendTransaction
      const accountAddress = yield* getConnectedAccountAddress()
      const manifest = yield* governance.makeMajorityJudgmentElectionManifest({
        accountAddress,
        ...input
      })
      const result = yield* sendTransaction(
        manifest,
        `Creating Majority Judgment election: ${input.title}`
      )

      const events = yield* gatewayApiClient.transaction
        .getCommittedDetails(result.transactionIntentHash)
        .pipe(
          Effect.map((result) =>
            Option.fromNullable(result.transaction.receipt?.events)
          )
        )

      const electionCreatedEvent = yield* pipe(
        events,
        Option.flatMap((events) =>
          A.findFirst(
            events,
            (event) => event.name === 'MajorityJudgmentElectionCreatedEvent'
          )
        ),
        Option.map((event) => event.data),
        Option.match({
          onSome: (sbor) =>
            parseSbor(sbor, MajorityJudgmentElectionCreatedEvent),
          onNone: () =>
            Effect.fail(
              new EventNotFoundError({
                message: 'MajorityJudgmentElectionCreatedEvent not found'
              })
            )
        })
      )

      return electionCreatedEvent
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

export const recordTemperatureCheckOutcomeAtom = governanceRuntime.fn(
  Effect.fn(
    function* (
      input: {
        readonly temperatureCheckId: TemperatureCheckId
        readonly passed: boolean
        readonly electionId?: MajorityJudgmentElectionId
      },
      get
    ) {
      const governance = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const accountAddress = yield* getConnectedAccountAddress()
      const manifest = yield* governance.recordTemperatureCheckOutcomeManifest({
        accountAddress,
        ...input
      })
      const result = yield* sendTransaction(
        manifest,
        `Recording TC #${input.temperatureCheckId} as ${input.passed ? 'passed' : 'failed'}`
      )
      get.refresh(getTemperatureCheckByIdAtom(input.temperatureCheckId))
      if (input.electionId !== undefined) {
        get.refresh(majorityJudgmentElectionAtom(input.electionId))
      }
      return result
    },
    withToast({
      whenLoading: 'Recording Temperature Check outcome...',
      whenSuccess: 'Temperature Check outcome recorded',
      whenFailure: transactionFailureMessage(
        'Failed to record Temperature Check outcome'
      )
    })
  )
)

export const startMajorityJudgmentRerunAtom = governanceRuntime.fn(
  Effect.fn(
    function* (
      input: { readonly electionId: MajorityJudgmentElectionId },
      get
    ) {
      const governance = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const voteClient = yield* VoteClient
      const election = yield* voteClient.GetMajorityJudgmentElection({
        electionId: input.electionId
      })
      if (!canStartMajorityJudgmentRerun(election.election.status)) {
        return yield* new InvalidMajorityJudgmentRerunStatusError({
          electionId: input.electionId,
          status: election.election.status,
          message: 'A rerun can only be opened after Round 1 failed quorum'
        })
      }
      const accountAddress = yield* getConnectedAccountAddress()
      const manifest = yield* governance.startMajorityJudgmentRerunManifest({
        accountAddress,
        electionId: input.electionId
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
      whenSuccess: 'Election rerun opened',
      whenFailure: transactionFailureMessage('Failed to start election rerun')
    })
  )
)

export const startMajorityJudgmentRoundOneAtom = governanceRuntime.fn(
  Effect.fn(
    function* (
      input: { readonly electionId: MajorityJudgmentElectionId },
      get
    ) {
      const governance = yield* GovernanceComponent
      const sendTransaction = yield* SendTransaction
      const voteClient = yield* VoteClient
      const election = yield* voteClient.GetMajorityJudgmentElection({
        electionId: input.electionId
      })
      if (!canOpenMajorityJudgmentRoundOne(election.election.status)) {
        return yield* new InvalidMajorityJudgmentRoundOneStatusError({
          electionId: input.electionId,
          status: election.election.status,
          message:
            'Round 1 can only be opened after the candidate list is approved'
        })
      }
      const accountAddress = yield* getConnectedAccountAddress()
      const manifest = yield* governance.startMajorityJudgmentRoundOneManifest({
        accountAddress,
        electionId: input.electionId
      })
      const result = yield* sendTransaction(
        manifest,
        `Opening Round 1 for Majority Judgment election #${input.electionId}`
      )
      get.refresh(majorityJudgmentElectionAtom(input.electionId))
      return result
    },
    withToast({
      whenLoading: 'Opening Round 1 grading...',
      whenSuccess: 'Round 1 grading opened',
      whenFailure: transactionFailureMessage('Failed to open Round 1 grading')
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
