import { assert, it } from '@effect/vitest'
import { Effect } from 'effect'
import { decodeLedgerDrainWatermark } from '../poll'

it.effect('decodes the drained Gateway ledger watermark', () =>
  Effect.gen(function* () {
    const watermark = yield* decodeLedgerDrainWatermark({
      network: 'mainnet',
      state_version: 1234,
      proposer_round_timestamp: '2026-07-29T10:00:00.000Z',
      epoch: 42,
      round: 7
    })

    assert.strictEqual(watermark.stateVersion, 1234)
    assert.strictEqual(
      watermark.proposerRoundTimestamp.toISOString(),
      '2026-07-29T10:00:00.000Z'
    )
  })
)
