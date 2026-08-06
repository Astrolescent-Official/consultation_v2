import type {
  CommittedTransactionInfo,
  DetailedEventsItem,
  ProgrammaticScryptoSborValue
} from '@radixdlt/babylon-gateway-api-sdk'
import { Effect, Layer } from 'effect'
import {
  EntityId,
  GovernanceComponent,
  GovernanceConfig
} from 'shared/governance/index'
import { assert, describe, it } from 'vitest'
import {
  dedupeGovernanceActions,
  GovernanceEventProcessor
} from '../governanceEvents'

const governanceComponentAddress =
  'component_rdx1cp90ys553uwxuckev249x5wezucqru0u4qr7qdxdc9tlpmnh93242k'

const creationEvent = (
  event: string,
  programmaticJson: ProgrammaticScryptoSborValue
) =>
  ({
    emitter: {
      type: 'EntityMethod',
      global_emitter: governanceComponentAddress
    },
    identifier: { event },
    payload: { programmatic_json: programmaticJson }
  }) as DetailedEventsItem

const processorLayer = GovernanceEventProcessor.DefaultWithoutDependencies.pipe(
  Layer.provide(
    Layer.merge(
      GovernanceConfig.MainnetLive,
      Layer.succeed(GovernanceComponent, null as never)
    )
  )
)

describe('governance event action routing', () => {
  it('routes both round-start variants through live-state projection', async () => {
    const roundStarted = (electionId: number, round: 'RoundOne' | 'Rerun') =>
      creationEvent('MajorityJudgmentRoundStartedEvent', {
        kind: 'Tuple',
        type_name: 'MajorityJudgmentRoundStartedEvent',
        fields: [
          {
            kind: 'U64',
            field_name: 'election_id',
            value: String(electionId)
          },
          {
            kind: 'Enum',
            type_name: 'MajorityJudgmentRoundId',
            field_name: 'round',
            variant_name: round,
            variant_id: round === 'RoundOne' ? '0' : '1',
            fields: []
          },
          {
            kind: 'I64',
            type_name: 'Instant',
            field_name: 'snapshot',
            value: '1785456000'
          },
          {
            kind: 'I64',
            type_name: 'Instant',
            field_name: 'start',
            value: '1786147200'
          },
          {
            kind: 'I64',
            type_name: 'Instant',
            field_name: 'deadline',
            value: '1786752000'
          },
          { kind: 'Decimal', field_name: 'quorum', value: '1000' },
          {
            kind: 'Enum',
            type_name: 'Grade',
            field_name: 'minimum_median_grade',
            variant_name: 'Good',
            variant_id: '2',
            fields: []
          }
        ]
      })

    const actions = await Effect.runPromise(
      Effect.gen(function* () {
        const processor = yield* GovernanceEventProcessor
        return yield* processor.processBatch([
          {
            state_version: 101,
            round_timestamp: '2026-08-01T00:00:00.000Z',
            receipt: { detailed_events: [roundStarted(7, 'RoundOne')] }
          } as CommittedTransactionInfo,
          {
            state_version: 102,
            round_timestamp: '2026-08-02T00:00:00.000Z',
            receipt: { detailed_events: [roundStarted(8, 'Rerun')] }
          } as CommittedTransactionInfo
        ])
      }).pipe(Effect.provide(processorLayer))
    )

    assert.deepStrictEqual(
      actions.map((action) => {
        assert.equal(action._tag, 'MajorityJudgmentRoundStarted')
        if (action._tag !== 'MajorityJudgmentRoundStarted') {
          throw new Error('Expected a Majority Judgment round-start action')
        }
        return {
          _tag: action._tag,
          electionId: action.electionId,
          stateVersion: action.stateVersion
        }
      }),
      [
        {
          _tag: 'MajorityJudgmentRoundStarted',
          electionId: 7,
          stateVersion: 101
        },
        {
          _tag: 'MajorityJudgmentRoundStarted',
          electionId: 8,
          stateVersion: 102
        }
      ]
    )
  })

  it('routes standard entity creation as authoritative zero-vote initialization', async () => {
    const commonFields = [
      { kind: 'String' as const, field_name: 'title', value: 'Governance' },
      {
        kind: 'I64' as const,
        type_name: 'Instant',
        field_name: 'start',
        value: '1785542400'
      },
      {
        kind: 'I64' as const,
        type_name: 'Instant',
        field_name: 'deadline',
        value: '1786147200'
      },
      {
        kind: 'String' as const,
        field_name: 'parameter_set_id',
        value: 'default'
      },
      {
        kind: 'U32' as const,
        field_name: 'parameter_set_version',
        value: '1'
      }
    ]
    const temperatureCheck = creationEvent('TemperatureCheckCreatedEvent', {
      kind: 'Tuple',
      type_name: 'TemperatureCheckCreatedEvent',
      fields: [
        { kind: 'U64', field_name: 'temperature_check_id', value: '4' },
        commonFields[0],
        {
          kind: 'I64',
          type_name: 'Instant',
          field_name: 'snapshot',
          value: '1785456000'
        },
        ...commonFields.slice(1)
      ]
    })
    const proposal = creationEvent('ProposalCreatedEvent', {
      kind: 'Tuple',
      type_name: 'ProposalCreatedEvent',
      fields: [
        { kind: 'U64', field_name: 'proposal_id', value: '8' },
        { kind: 'U64', field_name: 'temperature_check_id', value: '4' },
        ...commonFields
      ]
    })

    const actions = await Effect.runPromise(
      Effect.gen(function* () {
        const processor = yield* GovernanceEventProcessor
        return yield* processor.processBatch([
          {
            state_version: 100,
            round_timestamp: '2026-08-01T00:00:00.000Z',
            receipt: { detailed_events: [temperatureCheck, proposal] }
          } as CommittedTransactionInfo
        ])
      }).pipe(Effect.provide(processorLayer))
    )

    assert.deepStrictEqual(actions, [
      {
        _tag: 'StandardEntityCreated',
        type: 'temperature_check',
        entityId: EntityId.make(4)
      },
      {
        _tag: 'StandardEntityCreated',
        type: 'proposal',
        entityId: EntityId.make(8)
      }
    ])
  })

  it('keeps the latest vote count per majority-judgment round', () => {
    const actions = dedupeGovernanceActions([
      {
        _tag: 'MajorityJudgmentCreated',
        electionId: 7,
        observedAt: new Date('2026-07-01T00:00:00.000Z'),
        stateVersion: 100
      },
      {
        _tag: 'MajorityJudgmentVotesChanged',
        electionId: 7,
        round: 'RoundOne',
        voteCount: 2,
        observedAt: new Date('2026-07-09T00:00:00.000Z'),
        stateVersion: 101
      },
      {
        _tag: 'MajorityJudgmentVotesChanged',
        electionId: 7,
        round: 'RoundOne',
        voteCount: 4,
        observedAt: new Date('2026-07-10T00:00:00.000Z'),
        stateVersion: 103
      },
      {
        _tag: 'MajorityJudgmentVotesChanged',
        electionId: 7,
        round: 'Rerun',
        voteCount: 1,
        observedAt: new Date('2026-07-20T00:00:00.000Z'),
        stateVersion: 104
      }
    ])

    assert.deepStrictEqual(
      actions.map((action) =>
        action._tag === 'MajorityJudgmentVotesChanged'
          ? [action._tag, action.round, action.voteCount]
          : [action._tag]
      ),
      [
        ['MajorityJudgmentCreated'],
        ['MajorityJudgmentVotesChanged', 'RoundOne', 4],
        ['MajorityJudgmentVotesChanged', 'Rerun', 1]
      ]
    )
  })

  it('keeps replaced actions at their latest ledger position', () => {
    const actions = dedupeGovernanceActions([
      {
        _tag: 'MajorityJudgmentVisibilityChanged',
        electionId: 7,
        observedAt: new Date('2026-07-09T00:00:00.000Z'),
        stateVersion: 100
      },
      {
        _tag: 'MajorityJudgmentVotesChanged',
        electionId: 7,
        round: 'RoundOne',
        voteCount: 1,
        observedAt: new Date('2026-07-10T00:00:00.000Z'),
        stateVersion: 101
      },
      {
        _tag: 'MajorityJudgmentVisibilityChanged',
        electionId: 7,
        observedAt: new Date('2026-07-11T00:00:00.000Z'),
        stateVersion: 102
      }
    ])

    assert.deepStrictEqual(
      actions.map((action) => [
        action._tag,
        'stateVersion' in action ? action.stateVersion : undefined
      ]),
      [
        ['MajorityJudgmentVotesChanged', 101],
        ['MajorityJudgmentVisibilityChanged', 102]
      ]
    )
  })
})
