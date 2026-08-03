import { assert, describe, it } from '@effect/vitest'
import {
  GetComponentStateService,
  GetKeyValueStoreService,
  GetLedgerStateService,
  KeyValueStoreDataService,
  StateEntityDetails
} from '@radix-effects/gateway'
import {
  AccountAddress,
  ComponentAddress,
  FungibleResourceAddress,
  NonFungibleResourceAddress,
  PackageAddress
} from '@radix-effects/shared'
import { Effect, Layer, Option } from 'effect'
import { AdminBadgeService } from './adminBadge'
import { GovernanceConfig } from './config'
import { GovernanceComponent } from './governanceComponent'
import {
  encodeManifestString,
  renderCandidateGrades,
  renderCandidateOrder,
  renderGovernanceParameterSetInput,
  renderInstant,
  renderMajorityJudgmentCandidateInputs,
  renderParameterSetIdOption,
  renderTemperatureCheckDraft
} from './governanceManifests'

const accountAddress = AccountAddress.make('account_test')
const governanceLayer = GovernanceComponent.DefaultWithoutDependencies.pipe(
  Layer.provide(
    Layer.mergeAll(
      Layer.succeed(GetKeyValueStoreService, null as never),
      Layer.succeed(GetLedgerStateService, null as never),
      Layer.succeed(StateEntityDetails, null as never),
      Layer.succeed(GetComponentStateService, null as never),
      Layer.succeed(KeyValueStoreDataService, null as never),
      Layer.succeed(AdminBadgeService, {
        getForAccount: () =>
          Effect.succeed(Option.some({ _tag: 'FungibleAdminBadge' as const }))
      } as never),
      Layer.succeed(GovernanceConfig, {
        packageAddress: PackageAddress.make('package_test'),
        componentAddress: ComponentAddress.make('component_test'),
        adminBadgeAddress: NonFungibleResourceAddress.make('resource_admin'),
        xrdResourceAddress: FungibleResourceAddress.make('resource_xrd')
      })
    )
  )
)

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
        _tag: 'Standard',
        label: hostile,
        temperatureCheck: {
          votingDays: 7,
          quorum: '1000',
          approvalThreshold: '0.6'
        },
        proposal: {
          votingDays: 14,
          quorum: '5000',
          approvalThreshold: '0.7'
        }
      }),
      `Tuple(${JSON.stringify(hostile)}, Enum<0u8>(Tuple(7u32, Decimal("1000"), Decimal("0.6")), Tuple(14u32, Decimal("5000"), Decimal("0.7"))))`
    )
  })

  it('safely serializes TC text, vote options, and links', () => {
    const hostile = '"\nCALL_METHOD Address("component_bad") "attack";'
    const rendered = renderTemperatureCheckDraft({
      title: hostile,
      shortDescription: hostile,
      description: hostile,
      links: [`https://example.com/${hostile}`],
      followUp: {
        _tag: 'StandardProposal',
        voteOptions: [hostile, 'Against'],
        maxSelections: 1
      }
    })

    assert.isTrue(rendered.includes(JSON.stringify(hostile)))
    assert.isTrue(
      rendered.includes(JSON.stringify(`https://example.com/${hostile}`))
    )
    assert.isFalse(rendered.includes(`Tuple("${hostile}")`))
  })

  it('renders complete MJ ballots in candidate-id order', () => {
    assert.strictEqual(
      renderCandidateGrades([
        { candidateId: 2, grade: 3 },
        { candidateId: 0, grade: 4 },
        { candidateId: 1, grade: 1 }
      ]),
      'Array<Tuple>(Tuple(Tuple(0u32), Enum<4u8>()), Tuple(Tuple(1u32), Enum<1u8>()), Tuple(Tuple(2u32), Enum<3u8>()))'
    )
  })

  it('renders Instant and candidate permutation values with manifest types', () => {
    assert.strictEqual(
      renderInstant(new Date('2026-07-01T00:00:00.000Z')),
      '1782864000i64'
    )
    assert.strictEqual(
      renderCandidateOrder([2, 0, 1]),
      'Array<Tuple>(Tuple(2u32), Tuple(0u32), Tuple(1u32))'
    )
  })

  it('escapes every MJ candidate field before rendering', () => {
    const hostile = '"\nCALL_METHOD Address("component_bad") "attack";'
    const rendered = renderMajorityJudgmentCandidateInputs([
      {
        reference: hostile,
        displayName: hostile,
        description: hostile,
        links: [`https://example.com/${hostile}`]
      }
    ])

    assert.isTrue(rendered.includes(JSON.stringify(hostile)))
    assert.isTrue(
      rendered.includes(JSON.stringify(`https://example.com/${hostile}`))
    )
    assert.isFalse(rendered.includes(`Tuple("${hostile}")`))
  })

  it.effect('opens both MJ rounds immediately with an admin proof', () =>
    Effect.gen(function* () {
      const governance = yield* GovernanceComponent
      const roundOne = yield* governance.startMajorityJudgmentRoundOneManifest({
        accountAddress,
        electionId: 7
      })
      const rerun = yield* governance.startMajorityJudgmentRerunManifest({
        accountAddress,
        electionId: 7
      })

      for (const [method, manifest] of [
        ['start_majority_judgment_round_one', roundOne],
        ['start_majority_judgment_rerun', rerun]
      ] as const) {
        assert.include(manifest, '"create_proof_of_amount"')
        assert.include(manifest, `"${method}"`)
        assert.include(manifest, '7u64')
        assert.notInclude(manifest, 'Instant(')
      }
    }).pipe(Effect.provide(governanceLayer))
  )
})
