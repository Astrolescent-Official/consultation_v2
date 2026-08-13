import { assert, layer } from '@effect/vitest'
import {
  GetKeyValueStoreService,
  KeyValueStoreDataService,
  KeyValueStoreKeysService
} from '@radix-effects/gateway'
import type {
  LedgerState,
  StateKeyValueStoreDataResponse,
  StateKeyValueStoreKeysResponse
} from '@radixdlt/babylon-gateway-api-sdk'
import { Effect, Layer } from 'effect'

const ledgerState = {
  network: 'stokenet',
  state_version: 77,
  proposer_round_timestamp: '2026-07-21T00:00:00.000Z',
  epoch: 1,
  round: 1
} satisfies LedgerState

const keyRequests: Array<{
  readonly cursor?: string
  readonly at_ledger_state?: { readonly state_version: number }
}> = []
let dataLedgerState: { readonly state_version: number } | undefined
let requestedDataKeyCount = 0

const keysLayer = Layer.succeed(
  KeyValueStoreKeysService,
  Effect.fn('testParameterSetKeys')((input) =>
    Effect.sync(() => {
      keyRequests.push({
        cursor: input.cursor,
        at_ledger_state:
          input.at_ledger_state && 'state_version' in input.at_ledger_state
            ? input.at_ledger_state
            : undefined
      })

      return {
        ledger_state: ledgerState,
        key_value_store_address: input.key_value_store_address,
        items: [
          {
            key: {
              raw_hex: input.cursor ? '02' : '01',
              programmatic_json: {
                kind: 'String',
                value: input.cursor ? 'constitutional' : 'default'
              }
            }
          }
        ],
        next_cursor: input.cursor ? undefined : 'page-2'
      } satisfies StateKeyValueStoreKeysResponse
    })
  )
)

const dataLayer = Layer.succeed(
  KeyValueStoreDataService,
  Effect.fn('testParameterSetData')((input) =>
    Effect.sync(() => {
      dataLedgerState =
        input.at_ledger_state && 'state_version' in input.at_ledger_state
          ? input.at_ledger_state
          : undefined
      requestedDataKeyCount = input.keys.length

      return [
        {
          ledger_state: ledgerState,
          key_value_store_address: input.key_value_store_address,
          entries: []
        }
      ] satisfies StateKeyValueStoreDataResponse[]
    })
  )
)

const testLayer = GetKeyValueStoreService.DefaultWithoutDependencies.pipe(
  Layer.provide(Layer.mergeAll(keysLayer, dataLayer))
)

layer(testLayer)('stable governance parameter registry reads', (it) => {
  it.effect(
    'pins every cursor and value request to the first ledger state',
    () =>
      Effect.gen(function* () {
        keyRequests.length = 0
        dataLedgerState = undefined
        requestedDataKeyCount = 0

        const getKeyValueStore = yield* GetKeyValueStoreService
        yield* getKeyValueStore({
          address: 'internal_keyvaluestore_parameters'
        })

        assert.strictEqual(keyRequests.length, 2)
        assert.isUndefined(keyRequests[0]?.at_ledger_state)
        assert.deepStrictEqual(keyRequests[1]?.at_ledger_state, {
          state_version: 77
        })
        assert.deepStrictEqual(dataLedgerState, { state_version: 77 })
        assert.strictEqual(requestedDataKeyCount, 2)
      })
  )
})
