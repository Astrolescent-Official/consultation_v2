import type {
  CommittedTransactionInfo,
  DetailedEventsItem,
  ProgrammaticScryptoSborValue
} from '@radixdlt/babylon-gateway-api-sdk'
import { Array as A, Effect, Option, Schema } from 'effect'
import { ProposalId, TemperatureCheckId } from 'shared/governance/brandedTypes'
import { GovernanceConfig } from 'shared/governance/config'
import { GovernanceComponent } from 'shared/governance/index'
import { parseSbor } from 'shared/helpers/parseSbor'
import {
  MajorityJudgmentElectionCreatedEvent,
  MajorityJudgmentElectionHiddenToggledEvent,
  MajorityJudgmentElectionVotedEvent,
  MajorityJudgmentRerunStartedEvent,
  MajorityJudgmentTieResolutionRecordedEvent,
  ProposalVotedEvent,
  TemperatureCheckVotedEvent
} from 'shared/schemas'
import type { VoteCalculationPayload } from './vote-calculation/types'

type StandardPayload = typeof VoteCalculationPayload.Type

export type GovernanceAction =
  | {
      readonly _tag: 'StandardVotesChanged'
      readonly payload: StandardPayload
    }
  | {
      readonly _tag: 'MajorityJudgmentCreated'
      readonly electionId: number
      readonly observedAt: Date
      readonly stateVersion: number
    }
  | {
      readonly _tag: 'MajorityJudgmentVotesChanged'
      readonly electionId: number
      readonly round: 'RoundOne' | 'Rerun'
      readonly voteCount: number
      readonly observedAt: Date
      readonly stateVersion: number
    }
  | {
      readonly _tag: 'MajorityJudgmentRerunStarted'
      readonly electionId: number
      readonly observedAt: Date
      readonly stateVersion: number
    }
  | {
      readonly _tag: 'MajorityJudgmentTieResolutionRecorded'
      readonly electionId: number
      readonly round: 'RoundOne' | 'Rerun'
      readonly orderedCandidateIds: ReadonlyArray<number>
      readonly observedAt: Date
      readonly stateVersion: number
    }
  | {
      readonly _tag: 'MajorityJudgmentVisibilityChanged'
      readonly electionId: number
      readonly observedAt: Date
      readonly stateVersion: number
    }

const actionKey = (action: GovernanceAction) => {
  switch (action._tag) {
    case 'StandardVotesChanged':
      return `standard:${action.payload.type}:${action.payload.entityId}`
    case 'MajorityJudgmentVotesChanged':
      return `mj-votes:${action.electionId}:${action.round}`
    default:
      return `${action._tag}:${action.electionId}`
  }
}

export const dedupeGovernanceActions = (
  actions: ReadonlyArray<GovernanceAction>
) => {
  const deduped = new Map<string, GovernanceAction>()
  for (const action of actions) {
    const key = actionKey(action)
    const current = deduped.get(key)
    if (
      current?._tag === 'MajorityJudgmentVotesChanged' &&
      action._tag === 'MajorityJudgmentVotesChanged' &&
      current.voteCount > action.voteCount
    ) {
      continue
    }
    deduped.delete(key)
    deduped.set(key, action)
  }
  return [...deduped.values()]
}

const ProgrammaticScryptoSborValueSchema = Schema.declare(
  (input): input is ProgrammaticScryptoSborValue =>
    typeof input === 'object' && input !== null && 'kind' in input,
  { identifier: 'ProgrammaticScryptoSborValue' }
)

const EventTimestampSchema = Schema.Date

export class GovernanceEventProcessor extends Effect.Service<GovernanceEventProcessor>()(
  'GovernanceEventProcessor',
  {
    dependencies: [GovernanceComponent.Default],
    effect: Effect.gen(function* () {
      const governance = yield* GovernanceComponent
      const config = yield* GovernanceConfig

      const decodePayload = Effect.fn('GovernanceEventProcessor.decodePayload')(
        function* <A>(
          event: DetailedEventsItem,
          schema: Parameters<typeof parseSbor<A>>[1]
        ) {
          const payload = yield* Schema.decodeUnknown(
            ProgrammaticScryptoSborValueSchema
          )(event.payload.programmatic_json)
          return yield* parseSbor(payload, schema)
        }
      )

      const processEvent = Effect.fn('GovernanceEventProcessor.processEvent')(
        function* (
          event: DetailedEventsItem,
          observedAt: Date,
          stateVersion: number
        ) {
          if (
            event.emitter.type !== 'EntityMethod' ||
            event.emitter.global_emitter !== config.componentAddress
          ) {
            return Option.none<GovernanceAction>()
          }

          switch (event.identifier.event) {
            case 'TemperatureCheckVotedEvent': {
              const payload = yield* decodePayload(
                event,
                TemperatureCheckVotedEvent
              )
              const id = TemperatureCheckId.make(payload.temperature_check_id)
              const temperatureCheck =
                yield* governance.getTemperatureCheckById(id)
              return Option.some<GovernanceAction>({
                _tag: 'StandardVotesChanged',
                payload: {
                  type: 'temperature_check',
                  entityId: id,
                  keyValueStoreAddress: temperatureCheck.votes,
                  voteCount: temperatureCheck.voteCount,
                  start: temperatureCheck.start.getTime()
                }
              })
            }
            case 'ProposalVotedEvent': {
              const payload = yield* decodePayload(event, ProposalVotedEvent)
              const id = ProposalId.make(payload.proposal_id)
              const proposal = yield* governance.getProposalById(id)
              return Option.some<GovernanceAction>({
                _tag: 'StandardVotesChanged',
                payload: {
                  type: 'proposal',
                  entityId: id,
                  keyValueStoreAddress: proposal.votes,
                  voteCount: proposal.voteCount,
                  start: proposal.start.getTime()
                }
              })
            }
            case 'MajorityJudgmentElectionCreatedEvent': {
              const payload = yield* decodePayload(
                event,
                MajorityJudgmentElectionCreatedEvent
              )
              return Option.some<GovernanceAction>({
                _tag: 'MajorityJudgmentCreated',
                electionId: payload.election_id,
                observedAt,
                stateVersion
              })
            }
            case 'MajorityJudgmentElectionVotedEvent': {
              const payload = yield* decodePayload(
                event,
                MajorityJudgmentElectionVotedEvent
              )
              return Option.some<GovernanceAction>({
                _tag: 'MajorityJudgmentVotesChanged',
                electionId: payload.election_id,
                round: payload.round.variant,
                voteCount: payload.vote_id + 1,
                observedAt,
                stateVersion
              })
            }
            case 'MajorityJudgmentRerunStartedEvent': {
              const payload = yield* decodePayload(
                event,
                MajorityJudgmentRerunStartedEvent
              )
              return Option.some<GovernanceAction>({
                _tag: 'MajorityJudgmentRerunStarted',
                electionId: payload.election_id,
                observedAt,
                stateVersion
              })
            }
            case 'MajorityJudgmentTieResolutionRecordedEvent': {
              const payload = yield* decodePayload(
                event,
                MajorityJudgmentTieResolutionRecordedEvent
              )
              return Option.some<GovernanceAction>({
                _tag: 'MajorityJudgmentTieResolutionRecorded',
                electionId: payload.election_id,
                round: payload.round.variant,
                orderedCandidateIds: payload.ordered_candidate_ids.map(
                  ([candidateId]) => candidateId
                ),
                observedAt,
                stateVersion
              })
            }
            case 'MajorityJudgmentElectionHiddenToggledEvent': {
              const payload = yield* decodePayload(
                event,
                MajorityJudgmentElectionHiddenToggledEvent
              )
              return Option.some<GovernanceAction>({
                _tag: 'MajorityJudgmentVisibilityChanged',
                electionId: payload.election_id,
                observedAt,
                stateVersion
              })
            }
            default:
              yield* Effect.logDebug('Unrecognized governance event', {
                name: event.identifier.event
              })
              return Option.none<GovernanceAction>()
          }
        }
      )

      const processBatch = Effect.fn('GovernanceEventProcessor.processBatch')(
        function* (batch: ReadonlyArray<CommittedTransactionInfo>) {
          const actions = yield* Effect.forEach(batch, (transaction) =>
            Effect.gen(function* () {
              const observedAt = yield* Schema.decodeUnknown(
                EventTimestampSchema
              )(transaction.round_timestamp)
              return yield* Effect.forEach(
                transaction.receipt?.detailed_events ?? [],
                (event) =>
                  processEvent(event, observedAt, transaction.state_version)
              )
            })
          )
          return dedupeGovernanceActions(A.getSomes(actions.flat()))
        }
      )

      return { processBatch }
    })
  }
) {}
