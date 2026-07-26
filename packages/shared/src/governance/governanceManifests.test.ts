import { assert, describe, it } from '@effect/vitest'
import {
  encodeManifestString,
  renderGovernanceParameterSetInput,
  renderParameterSetIdOption,
  renderTemperatureCheckDraft
} from './governanceManifests'

describe('governance manifest serialization', () => {
  it('encodes optional parameter-set identifiers with the Scrypto Option shape', () => {
    assert.strictEqual(renderParameterSetIdOption(undefined), 'Enum<0u8>()')
    assert.strictEqual(
      renderParameterSetIdOption('constitutional'),
      'Enum<1u8>("constitutional")'
    )
  })

  it('escapes every interpolated string as a manifest string literal', () => {
    const hostile = 'Label"\nCALL_METHOD Address("component_bad") "attack";\\'

    assert.strictEqual(encodeManifestString(hostile), JSON.stringify(hostile))
    assert.strictEqual(
      renderGovernanceParameterSetInput({
        label: hostile,
        temperatureCheckDays: 7,
        temperatureCheckQuorum: '1000',
        temperatureCheckApprovalThreshold: '0.6',
        proposalLengthDays: 14,
        proposalQuorum: '5000',
        proposalApprovalThreshold: '0.7'
      }),
      `Tuple(${JSON.stringify(hostile)}, Tuple(7u16, Decimal("1000"), Decimal("0.6"), 14u16, Decimal("5000"), Decimal("0.7")))`
    )
  })

  it('safely serializes TC text, vote options, and links', () => {
    const hostile = '"\nCALL_METHOD Address("component_bad") "attack";'
    const rendered = renderTemperatureCheckDraft({
      title: hostile,
      shortDescription: hostile,
      description: hostile,
      voteOptions: [hostile, 'Against'],
      links: [`https://example.com/${hostile}`],
      maxSelections: 1
    })

    assert.isTrue(rendered.includes(JSON.stringify(hostile)))
    assert.isTrue(
      rendered.includes(JSON.stringify(`https://example.com/${hostile}`))
    )
    assert.isFalse(rendered.includes(`Tuple("${hostile}")`))
  })
})
