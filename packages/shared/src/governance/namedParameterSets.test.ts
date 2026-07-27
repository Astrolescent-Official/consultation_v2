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

const parameters = {
  temperature_check_days: 7,
  temperature_check_quorum: '1000',
  temperature_check_approval_threshold: '0.6',
  proposal_length_days: 14,
  proposal_quorum: '5000',
  proposal_approval_threshold: '0.7'
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

const commonConsultationFields = {
  title: 'A proposal',
  short_description: 'Summary',
  description: 'Description',
  vote_options: [
    { id: [0], label: 'For' },
    { id: [1], label: 'Against' }
  ],
  links: ['https://radixtalk.com/t/1'],
  max_selections: { variant: 'None', value: {} },
  voters: 'internal_keyvaluestore_voters',
  votes: 'internal_keyvaluestore_votes',
  vote_count: 3,
  revote_count: 1,
  start: 1_700_000_000,
  deadline: 1_700_604_800,
  author: 'account_test',
  hidden: false,
  parameter_set: parameterSetSnapshot
}

describe('named governance parameter set schemas', () => {
  it.effect('decodes registry records into a named domain value', () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknown(GovernanceParameterSetSchema)(
        parameterSet
      )

      assert.strictEqual(decoded.id, 'constitutional')
      assert.strictEqual(decoded.label, 'Constitutional')
      assert.strictEqual(decoded.version, 2)
      assert.isFalse(decoded.retired)
      assert.deepStrictEqual(decoded.parameters, {
        temperatureCheckDays: 7,
        temperatureCheckQuorum: '1000',
        temperatureCheckApprovalThreshold: '0.6',
        proposalLengthDays: 14,
        proposalQuorum: '5000',
        proposalApprovalThreshold: '0.7'
      })
    })
  )

  it.effect(
    'decodes TC and GP voting values only through their snapshots',
    () =>
      Effect.gen(function* () {
        const temperatureCheck = yield* Schema.decodeUnknown(
          TemperatureCheckSchema
        )({
          id: 4,
          ...commonConsultationFields,
          elevated_proposal_id: { variant: 'None', value: {} }
        })
        const proposal = yield* Schema.decodeUnknown(ProposalSchema)({
          id: 8,
          ...commonConsultationFields,
          temperature_check_id: 4
        })

        assert.strictEqual(temperatureCheck.parameterSet.id, 'constitutional')
        assert.strictEqual(
          temperatureCheck.parameterSet.parameters.temperatureCheckQuorum,
          '1000'
        )
        assert.isFalse('quorum' in temperatureCheck)
        assert.isFalse('approvalThreshold' in temperatureCheck)

        assert.strictEqual(proposal.parameterSet.version, 2)
        assert.strictEqual(
          proposal.parameterSet.parameters.proposalApprovalThreshold,
          '0.7'
        )
        assert.isFalse('quorum' in proposal)
        assert.isFalse('approvalThreshold' in proposal)
      })
  )

  it('separates active and retired registry records for UI consumers', () => {
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

  it('orders sets deterministically with the default set first', () => {
    const base = Schema.decodeUnknownSync(GovernanceParameterSetSchema)(
      parameterSet
    )
    // The Gateway returns key-value store entries in an unspecified order.
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

const rawParameters = {
  kind: 'Tuple',
  type_name: 'GovernanceParameters',
  fields: [
    { kind: 'U16', field_name: 'temperature_check_days', value: '7' },
    {
      kind: 'Decimal',
      field_name: 'temperature_check_quorum',
      value: '1000'
    },
    {
      kind: 'Decimal',
      field_name: 'temperature_check_approval_threshold',
      value: '0.6'
    },
    { kind: 'U16', field_name: 'proposal_length_days', value: '14' },
    { kind: 'Decimal', field_name: 'proposal_quorum', value: '5000' },
    {
      kind: 'Decimal',
      field_name: 'proposal_approval_threshold',
      value: '0.7'
    }
  ]
} satisfies ProgrammaticScryptoSborValue

describe('named governance parameter set SBOR integration', () => {
  it('decodes a string registry key and its Scrypto record', () => {
    const key = GovernanceParameterSetKeyValueStoreKey.safeParse({
      kind: 'String',
      value: 'constitutional'
    })
    const value = GovernanceParameterSetKeyValueStoreValue.safeParse({
      kind: 'Tuple',
      type_name: 'GovernanceParameterSet',
      fields: [
        { kind: 'String', field_name: 'label', value: 'Constitutional' },
        { kind: 'U32', field_name: 'version', value: '2' },
        { kind: 'Bool', field_name: 'retired', value: false },
        { ...rawParameters, field_name: 'parameters' }
      ]
    })

    assert.isTrue(key.isOk())
    assert.isTrue(value.isOk())
    if (key.isOk() && value.isOk()) {
      assert.strictEqual(key.value, 'constitutional')
      assert.strictEqual(value.value.version, 2)
      assert.strictEqual(value.value.parameters.proposal_quorum, '5000')
    }
  })

  it('accepts extended TC and GP creation events', () => {
    const temperatureCheckEvent = TemperatureCheckCreatedEvent.safeParse({
      kind: 'Tuple',
      type_name: 'TemperatureCheckCreatedEvent',
      fields: [
        { kind: 'U64', field_name: 'temperature_check_id', value: '4' },
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
    })
    const proposalEvent = ProposalCreatedEvent.safeParse({
      kind: 'Tuple',
      type_name: 'ProposalCreatedEvent',
      fields: [
        { kind: 'U64', field_name: 'proposal_id', value: '8' },
        { kind: 'U64', field_name: 'temperature_check_id', value: '4' },
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
          value: '1701209600'
        },
        {
          kind: 'String',
          field_name: 'parameter_set_id',
          value: 'constitutional'
        },
        { kind: 'U32', field_name: 'parameter_set_version', value: '2' }
      ]
    })

    assert.isTrue(temperatureCheckEvent.isOk())
    assert.isTrue(proposalEvent.isOk())
    if (temperatureCheckEvent.isOk() && proposalEvent.isOk()) {
      assert.strictEqual(
        temperatureCheckEvent.value.parameter_set_id,
        'constitutional'
      )
      assert.strictEqual(temperatureCheckEvent.value.parameter_set_version, 2)
      assert.strictEqual(proposalEvent.value.parameter_set_id, 'constitutional')
      assert.strictEqual(proposalEvent.value.parameter_set_version, 2)
    }
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
        {
          kind: 'Tuple',
          type_name: 'GovernanceParameterSet',
          field_name: 'parameter_set',
          fields: [
            { kind: 'String', field_name: 'label', value: 'Constitutional' },
            { kind: 'U32', field_name: 'version', value: '2' },
            { kind: 'Bool', field_name: 'retired', value: false },
            { ...rawParameters, field_name: 'parameters' }
          ]
        }
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
    if (updatedEvent.isOk() && retiredEvent.isOk()) {
      assert.strictEqual(updatedEvent.value.previous_version, 1)
      assert.strictEqual(updatedEvent.value.parameter_set.version, 2)
      assert.strictEqual(retiredEvent.value.version, 2)
    }
  })
})
