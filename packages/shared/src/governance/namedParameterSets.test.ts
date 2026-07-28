import { assert, describe, it } from '@effect/vitest'
import type { ProgrammaticScryptoSborValue } from '@radixdlt/babylon-gateway-api-sdk'
import { Effect, Schema } from 'effect'
import {
  GovernanceParameterSetKeyValueStoreKey,
  GovernanceParameterSetKeyValueStoreValue,
  GovernanceParameterSetRetiredEvent,
  GovernanceParameterSetUpdatedEvent,
  ProposalCreatedEvent,
  TemperatureCheckCreatedEvent
} from '../schemas'
import {
  DEFAULT_PARAMETER_SET_ID,
  GovernanceParameterSetSchema,
  ProposalSchema,
  partitionGovernanceParameterSets,
  TemperatureCheckSchema
} from './schemas'

const temperatureCheckParameters = {
  voting_days: 7,
  quorum: '1000',
  approval_threshold: '0.6'
}

const proposalParameters = {
  voting_days: 14,
  quorum: '5000',
  approval_threshold: '0.7'
}

const parameters = {
  variant: 'Standard',
  value: {
    temperature_check: temperatureCheckParameters,
    proposal: proposalParameters
  }
}

const parameterSet = {
  id: 'constitutional',
  label: 'Constitutional',
  version: 2,
  retired: false,
  parameters
}

const parameterSetSnapshot = {
  id: parameterSet.id,
  label: parameterSet.label,
  version: parameterSet.version,
  parameters
}

const commonFields = {
  title: 'A proposal',
  short_description: 'Summary',
  description: 'Description',
  links: ['https://radixtalk.com/t/1'],
  parameter_set: parameterSetSnapshot,
  voters: 'internal_keyvaluestore_voters',
  votes: 'internal_keyvaluestore_votes',
  vote_count: 3,
  revote_count: 1,
  start: new Date('2026-07-01T00:00:00.000Z'),
  deadline: new Date('2026-07-08T00:00:00.000Z'),
  author: 'account_test',
  hidden: false
}

const voteOptions = [
  { id: [0], label: 'For' },
  { id: [1], label: 'Against' }
]

describe('named governance parameter set schemas', () => {
  it.effect('decodes tagged registry records into a named domain value', () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknown(GovernanceParameterSetSchema)(
        parameterSet
      )

      assert.strictEqual(decoded.id, 'constitutional')
      assert.strictEqual(decoded.version, 2)
      assert.strictEqual(decoded.parameters._tag, 'Standard')
      if (decoded.parameters._tag === 'Standard') {
        assert.deepStrictEqual(decoded.parameters.temperatureCheck, {
          votingDays: 7,
          quorum: '1000',
          approvalThreshold: '0.6'
        })
        assert.deepStrictEqual(decoded.parameters.proposal, {
          votingDays: 14,
          quorum: '5000',
          approvalThreshold: '0.7'
        })
      }
    })
  )

  it.effect('decodes TC and GP values only through their snapshots', () =>
    Effect.gen(function* () {
      const temperatureCheck = yield* Schema.decodeUnknown(
        TemperatureCheckSchema
      )({
        id: 4,
        ...commonFields,
        follow_up: {
          variant: 'StandardProposal',
          value: {
            vote_options: voteOptions,
            max_selections: { variant: 'None' }
          }
        },
        continuation: { variant: 'None' }
      })
      const proposal = yield* Schema.decodeUnknown(ProposalSchema)({
        id: 8,
        ...commonFields,
        vote_options: voteOptions,
        max_selections: { variant: 'None' },
        temperature_check_id: 4
      })

      assert.strictEqual(temperatureCheck.followUp._tag, 'StandardProposal')
      assert.strictEqual(temperatureCheck.parameterSet.id, 'constitutional')
      assert.strictEqual(
        temperatureCheck.parameterSet.parameters.temperatureCheck.quorum,
        '1000'
      )
      assert.isFalse('quorum' in temperatureCheck)

      assert.strictEqual(proposal.parameterSet.version, 2)
      assert.strictEqual(proposal.parameterSet.parameters._tag, 'Standard')
      if (proposal.parameterSet.parameters._tag === 'Standard') {
        assert.strictEqual(
          proposal.parameterSet.parameters.proposal.approvalThreshold,
          '0.7'
        )
      }
    })
  )

  it('separates active and retired registry records', () => {
    const active = Schema.decodeUnknownSync(GovernanceParameterSetSchema)(
      parameterSet
    )
    const result = partitionGovernanceParameterSets([
      active,
      { ...active, id: 'retired-set', retired: true }
    ])

    assert.deepStrictEqual(
      result.active.map((item) => item.id),
      ['constitutional']
    )
    assert.deepStrictEqual(
      result.retired.map((item) => item.id),
      ['retired-set']
    )
  })

  it('orders sets deterministically with the default first', () => {
    const base = Schema.decodeUnknownSync(GovernanceParameterSetSchema)(
      parameterSet
    )
    const result = partitionGovernanceParameterSets([
      { ...base, id: 'treasury-budget' },
      { ...base, id: 'archived-b', retired: true },
      { ...base, id: DEFAULT_PARAMETER_SET_ID },
      { ...base, id: 'archived-a', retired: true },
      { ...base, id: 'constitutional' }
    ])

    assert.deepStrictEqual(
      result.active.map((item) => item.id),
      [DEFAULT_PARAMETER_SET_ID, 'constitutional', 'treasury-budget']
    )
    assert.deepStrictEqual(
      result.retired.map((item) => item.id),
      ['archived-a', 'archived-b']
    )
  })
})

const rawTemperatureCheckParameters = {
  kind: 'Tuple',
  type_name: 'TemperatureCheckParameters',
  field_name: 'temperature_check',
  fields: [
    { kind: 'U32', field_name: 'voting_days', value: '7' },
    { kind: 'Decimal', field_name: 'quorum', value: '1000' },
    {
      kind: 'Decimal',
      field_name: 'approval_threshold',
      value: '0.6'
    }
  ]
}

const rawProposalParameters = {
  kind: 'Tuple',
  type_name: 'StandardProposalParameters',
  field_name: 'proposal',
  fields: [
    { kind: 'U32', field_name: 'voting_days', value: '14' },
    { kind: 'Decimal', field_name: 'quorum', value: '5000' },
    {
      kind: 'Decimal',
      field_name: 'approval_threshold',
      value: '0.7'
    }
  ]
}

const rawParameters = {
  kind: 'Enum',
  type_name: 'GovernanceProcessParameters',
  variant_name: 'Standard',
  variant_id: 0,
  fields: [rawTemperatureCheckParameters, rawProposalParameters]
} satisfies ProgrammaticScryptoSborValue

const rawParameterSet = {
  kind: 'Tuple',
  type_name: 'GovernanceParameterSet',
  fields: [
    { kind: 'String', field_name: 'label', value: 'Constitutional' },
    { kind: 'U32', field_name: 'version', value: '2' },
    { kind: 'Bool', field_name: 'retired', value: false },
    { ...rawParameters, field_name: 'parameters' }
  ]
} satisfies ProgrammaticScryptoSborValue

describe('named governance parameter set SBOR integration', () => {
  it('decodes a string registry key and tagged Scrypto record', () => {
    const key = GovernanceParameterSetKeyValueStoreKey.safeParse({
      kind: 'String',
      value: 'constitutional'
    })
    const value =
      GovernanceParameterSetKeyValueStoreValue.safeParse(rawParameterSet)

    assert.isTrue(key.isOk())
    assert.isTrue(value.isOk())
    if (key.isOk() && value.isOk()) {
      assert.strictEqual(key.value, 'constitutional')
      assert.strictEqual(value.value.parameters.variant, 'Standard')
    }
  })

  it('accepts extended TC and GP creation events', () => {
    const baseFields = [
      { kind: 'String', field_name: 'title', value: 'A proposal' },
      {
        kind: 'I64',
        type_name: 'Instant',
        field_name: 'start',
        value: '1700000000'
      },
      {
        kind: 'I64',
        type_name: 'Instant',
        field_name: 'deadline',
        value: '1700604800'
      },
      {
        kind: 'String',
        field_name: 'parameter_set_id',
        value: 'constitutional'
      },
      { kind: 'U32', field_name: 'parameter_set_version', value: '2' }
    ]
    const temperatureCheckEvent = TemperatureCheckCreatedEvent.safeParse({
      kind: 'Tuple',
      type_name: 'TemperatureCheckCreatedEvent',
      fields: [
        { kind: 'U64', field_name: 'temperature_check_id', value: '4' },
        ...baseFields
      ]
    })
    const proposalEvent = ProposalCreatedEvent.safeParse({
      kind: 'Tuple',
      type_name: 'ProposalCreatedEvent',
      fields: [
        { kind: 'U64', field_name: 'proposal_id', value: '8' },
        { kind: 'U64', field_name: 'temperature_check_id', value: '4' },
        ...baseFields
      ]
    })

    assert.isTrue(temperatureCheckEvent.isOk())
    assert.isTrue(proposalEvent.isOk())
  })

  it('accepts parameter-set update and retirement events', () => {
    const updatedEvent = GovernanceParameterSetUpdatedEvent.safeParse({
      kind: 'Tuple',
      type_name: 'GovernanceParameterSetUpdatedEvent',
      fields: [
        {
          kind: 'String',
          field_name: 'parameter_set_id',
          value: 'constitutional'
        },
        { kind: 'U32', field_name: 'previous_version', value: '1' },
        { ...rawParameterSet, field_name: 'parameter_set' }
      ]
    })
    const retiredEvent = GovernanceParameterSetRetiredEvent.safeParse({
      kind: 'Tuple',
      type_name: 'GovernanceParameterSetRetiredEvent',
      fields: [
        {
          kind: 'String',
          field_name: 'parameter_set_id',
          value: 'constitutional'
        },
        { kind: 'U32', field_name: 'version', value: '2' }
      ]
    })

    assert.isTrue(updatedEvent.isOk())
    assert.isTrue(retiredEvent.isOk())
  })
})
