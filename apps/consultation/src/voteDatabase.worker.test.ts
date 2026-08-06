/// <reference types="@cloudflare/vitest-pool-workers" />

import { applyD1Migrations, env, SELF } from 'cloudflare:test'
import {
  AccountAddress,
  ComponentAddress,
  FungibleResourceAddress,
  PackageAddress,
  StateVersion
} from '@radix-effects/shared'
import {
  ConfigProvider,
  Deferred,
  Effect,
  Either,
  Fiber,
  Layer,
  Logger,
  Option,
  Record as R
} from 'effect'
import { MainnetGatewayApiClientLayer } from 'shared/gateway'
import { EntityId } from 'shared/governance/brandedTypes'
import {
  GovernanceConfig,
  GovernanceConfigLayer
} from 'shared/governance/index'
import { beforeEach, describe, expect, it } from 'vitest'
import { VoteDatabaseLive } from './server/voting/db/d1'
import {
  guardedBatch,
  type PollLeaseIdentity,
  withPollLease
} from './server/voting/pollLease'
import { PollLock } from './server/voting/pollLock'
import { VoteCalculationRepo } from './server/voting/vote-calculation/voteCalculationRepo'
import { VotePowerSnapshot } from './server/voting/vote-calculation/votePowerSnapshot'
import { getVotePowerConfig } from './server/voting/vote-calculation/voteSourceConfig'

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[]
  }
}

const account = AccountAddress.make(
  'account_rdx128y905cfjwhah5nm8mpx5jnlkshmlamfdd92qnqpy6pgk428qlqxcf'
)
const entityId = EntityId.make(1)
const lease: PollLeaseIdentity = {
  owner: 'test-poll-owner',
  durationMs: 60_000
}

const repositoryLayer = (
  governanceConfigLayer: Layer.Layer<GovernanceConfig> = GovernanceConfig.MainnetLive
) =>
  VoteCalculationRepo.Default.pipe(
    Layer.provide(VoteDatabaseLive(env.DB)),
    Layer.provide(governanceConfigLayer)
  )

const seedLease = async (owner = lease.owner) => {
  await env.DB.prepare(
    `INSERT INTO poll_lease (id, owner, expires_at)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at`
  )
    .bind(owner, Date.now() + 60_000)
    .run()
}

const runWithRepository = <A>(
  effect: Effect.Effect<A, never, VoteCalculationRepo>,
  governanceConfigLayer: Layer.Layer<GovernanceConfig> = GovernanceConfig.MainnetLive
) =>
  Effect.runPromise(
    withPollLease(lease, effect).pipe(
      Effect.provide(repositoryLayer(governanceConfigLayer))
    )
  )

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  await seedLease()
})

describe('runtime app configuration', () => {
  it('serves one canonical configuration to the browser and Worker routes', async () => {
    const scriptResponse = await SELF.fetch(
      'https://example.test/app-config.js'
    )
    expect(scriptResponse.status).toBe(200)
    expect(scriptResponse.headers.get('cache-control')).toBe('no-store')
    expect(scriptResponse.headers.get('content-type')).toBe(
      'application/javascript; charset=utf-8'
    )
    expect(await scriptResponse.text()).toBe(
      'globalThis.__APP_CONFIG__={"ENV":"production","DAPP_DEFINITION_ADDRESS":"account_rdx128965k8mhauk679vtew96ynq4k43rzd975jak4d5z6cvp0t0c6z7u0","NETWORK_ID":"1"};'
    )

    const wellKnownResponse = await SELF.fetch(
      'https://example.test/.well-known/radix.json'
    )
    expect(await wellKnownResponse.json()).toEqual({
      dApps: [
        {
          dAppDefinitionAddress:
            'account_rdx128965k8mhauk679vtew96ynq4k43rzd975jak4d5z6cvp0t0c6z7u0'
        }
      ]
    })
  })

  it('uses the documented Stokenet governance component', async () => {
    const layer = GovernanceConfigLayer.pipe(
      Layer.provide(
        Layer.setConfigProvider(ConfigProvider.fromJson({ NETWORK_ID: 2 }))
      )
    )
    const readConfig = <E>(
      configLayer: Layer.Layer<GovernanceConfig, E, never>
    ) =>
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* GovernanceConfig
        }).pipe(Effect.provide(configLayer))
      )
    const [config, expected] = await Promise.all([
      readConfig(layer),
      readConfig(GovernanceConfig.StokenetLive)
    ])

    expect(config.componentAddress).toBe(expected.componentAddress)
  })
})

describe('D1 vote persistence', () => {
  it('tracks computed readiness explicitly and backfills each component independently', async () => {
    const zeroVoteEntityId = EntityId.make(10)
    const pendingEntityId = EntityId.make(11)

    const mainnet = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* VoteCalculationRepo
        yield* repo.initializeComponentCache([
          {
            type: 'temperature_check',
            entityId: zeroVoteEntityId,
            voteCount: 0
          },
          { type: 'proposal', entityId: pendingEntityId, voteCount: 2 }
        ])
        const zeroVote = yield* repo.getResultsByEntity(
          'temperature_check',
          zeroVoteEntityId
        )
        const pending = yield* repo.getResultsByEntity(
          'proposal',
          pendingEntityId
        )
        yield* repo.setComponentCacheBackfillProgress(5)
        const progress = yield* repo.getComponentCacheBackfillProgress()
        return { zeroVote, pending, progress }
      })
    )

    expect(mainnet).toEqual({
      zeroVote: { cacheAvailable: true, results: [] },
      pending: { cacheAvailable: false, results: [] },
      progress: 5
    })

    const stokenetProgress = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* VoteCalculationRepo
        return yield* repo.getComponentCacheBackfillProgress()
      }),
      GovernanceConfig.StokenetLive
    )
    expect(stokenetProgress).toBe(0)
  })

  it('isolates same-ID vote states from different governance components', async () => {
    await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* VoteCalculationRepo
        const state = yield* repo.getOrCreateState(
          'temperature_check',
          entityId
        )
        yield* repo.commitVoteResults({
          stateId: state.id,
          type: 'temperature_check',
          entityId,
          lastVoteCount: 1,
          results: [{ vote: 'For', votePower: '100' }],
          accountVotes: [
            { accountAddress: account, vote: 'For', votePower: '100' }
          ],
          revoteRemovals: []
        })
      }),
      GovernanceConfig.StokenetLive
    )

    const mainnetResults = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* VoteCalculationRepo
        return yield* repo.getResultsByEntity('temperature_check', entityId)
      })
    )
    expect(mainnetResults).toEqual({ cacheAvailable: false, results: [] })

    const stokenetResults = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* VoteCalculationRepo
        return yield* repo.getResultsByEntity('temperature_check', entityId)
      }),
      GovernanceConfig.StokenetLive
    )
    expect(stokenetResults).toEqual({
      cacheAvailable: true,
      results: [{ vote: 'For', votePower: '100' }]
    })
  })

  it('commits a revote exactly once and preserves decimal precision', async () => {
    const votePower = '9007199254740993.000000000000000001'

    await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* VoteCalculationRepo
        const state = yield* repo.getOrCreateState('proposal', entityId)

        yield* repo.commitVoteResults({
          stateId: state.id,
          type: 'proposal',
          entityId,
          lastVoteCount: 1,
          results: [{ vote: 'For', votePower }],
          accountVotes: [{ accountAddress: account, vote: 'For', votePower }],
          revoteRemovals: []
        })
        yield* repo.commitVoteResults({
          stateId: state.id,
          type: 'proposal',
          entityId,
          lastVoteCount: 2,
          results: [{ vote: 'Against', votePower }],
          accountVotes: [
            { accountAddress: account, vote: 'Against', votePower }
          ],
          revoteRemovals: [
            {
              accountAddress: account,
              oldVotes: [{ vote: 'For', votePower }]
            }
          ]
        })
      })
    )

    const resultsResponse = await SELF.fetch(
      'https://example.test/vote-results?type=proposal&entityId=1'
    )
    expect(resultsResponse.status).toBe(200)
    expect(await resultsResponse.json()).toEqual({
      cacheAvailable: true,
      results: [
        { vote: 'Against', votePower },
        { vote: 'For', votePower: '0' }
      ]
    })

    const accountResponse = await SELF.fetch(
      'https://example.test/account-votes?type=proposal&entityId=1'
    )
    expect(await accountResponse.json()).toEqual([
      { accountAddress: account, vote: 'Against', votePower }
    ])
  })

  it('rolls back every statement when one write in a commit fails', async () => {
    const votePower = '123.456789012345678901'
    const stateId = await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* VoteCalculationRepo
        const state = yield* repo.getOrCreateState('proposal', entityId)
        yield* repo.commitVoteResults({
          stateId: state.id,
          type: 'proposal',
          entityId,
          lastVoteCount: 1,
          results: [{ vote: 'For', votePower }],
          accountVotes: [{ accountAddress: account, vote: 'For', votePower }],
          revoteRemovals: []
        })
        return state.id
      })
    )

    await expect(
      runWithRepository(
        Effect.gen(function* () {
          const repo = yield* VoteCalculationRepo
          yield* repo.commitVoteResults({
            stateId,
            type: 'proposal',
            entityId,
            lastVoteCount: 2,
            results: [{ vote: 'Against', votePower }],
            accountVotes: [
              {
                accountAddress: account,
                vote: null as unknown as string,
                votePower
              }
            ],
            revoteRemovals: [
              {
                accountAddress: account,
                oldVotes: [{ vote: 'For', votePower }]
              }
            ]
          })
        })
      )
    ).rejects.toBeDefined()

    const state = await env.DB.prepare(
      `SELECT last_vote_count AS lastVoteCount
       FROM vote_calculation_state WHERE id = ?`
    )
      .bind(stateId)
      .first<{ lastVoteCount: number }>()
    expect(state?.lastVoteCount).toBe(1)

    const accountVotes = await env.DB.prepare(
      `SELECT vote, vote_power AS votePower
       FROM vote_calculation_account_votes WHERE state_id = ?`
    )
      .bind(stateId)
      .all<{ vote: string; votePower: string }>()
    expect(accountVotes.results).toEqual([{ vote: 'For', votePower }])
  })

  it('orders decimal text by exact numeric value', async () => {
    const accounts = [
      AccountAddress.make(
        'account_rdx128y905cfjwhah5nm8mpx5jnlkshmlamfdd92qnqpy6pgk428qlqxcf'
      ),
      AccountAddress.make(
        'account_rdx12xl2meqtelz47mwp3nzd72jkwyallg5yxr9hkc75ac4qztsxulfpew'
      ),
      AccountAddress.make(
        'account_rdx129xqyvgkn9h73atyrzndal004fwye3tzw49kkygv9ltm2kyrv2lmda'
      )
    ]
    const powers = ['2', '10.000000000000000001', '9007199254740993']

    await runWithRepository(
      Effect.gen(function* () {
        const repo = yield* VoteCalculationRepo
        const state = yield* repo.getOrCreateState('proposal', entityId)
        yield* repo.commitVoteResults({
          stateId: state.id,
          type: 'proposal',
          entityId,
          lastVoteCount: 3,
          results: [
            { vote: 'For', votePower: '9007199254741005.000000000000000001' }
          ],
          accountVotes: accounts.map((accountAddress, index) => ({
            accountAddress,
            vote: 'For',
            votePower: powers[index] ?? '0'
          })),
          revoteRemovals: []
        })
      })
    )

    const response = await SELF.fetch(
      'https://example.test/account-votes?type=proposal&entityId=1'
    )
    const rows = (await response.json()) as Array<{ votePower: string }>
    expect(rows.map((row) => row.votePower)).toEqual([
      '9007199254740993',
      '10.000000000000000001',
      '2'
    ])
  })
})

describe('D1 poll lease', () => {
  it('allows only one overlapping poll owner', async () => {
    await env.DB.prepare('DELETE FROM poll_lease').run()
    const config = Layer.setConfigProvider(
      ConfigProvider.fromMap(new Map([['POLL_TIMEOUT_DURATION', '60 seconds']]))
    )
    const layer = PollLock.Default.pipe(
      Layer.provide(VoteDatabaseLive(env.DB)),
      Layer.provide(config)
    )

    const secondAttempt = await Effect.runPromise(
      Effect.gen(function* () {
        const withLock = yield* PollLock
        const acquired = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const firstFiber = yield* Effect.fork(
          withLock(
            Deferred.succeed(acquired, undefined).pipe(
              Effect.zipRight(Deferred.await(release))
            )
          )
        )

        yield* Deferred.await(acquired)
        const attempt = yield* Effect.either(withLock(Effect.void))
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(firstFiber)
        return attempt
      }).pipe(Effect.provide(layer))
    )

    expect(Either.isLeft(secondAttempt)).toBe(true)
    if (Either.isLeft(secondAttempt)) {
      expect(secondAttempt.left._tag).toBe('PollLockNotAcquired')
    }
  })

  it('does not write or advance a cursor after lease ownership is lost', async () => {
    await env.DB.prepare(
      `INSERT INTO config (key, value) VALUES ('ledger_state_version', '100')`
    ).run()
    await seedLease('different-owner')

    await expect(
      Effect.runPromise(
        withPollLease(
          lease,
          guardedBatch(env.DB, 'advance stale cursor', [
            env.DB.prepare(
              `UPDATE config SET value = '200' WHERE key = 'ledger_state_version'`
            )
          ])
        )
      )
    ).rejects.toBeDefined()

    const cursor = await env.DB.prepare(
      `SELECT value FROM config WHERE key = 'ledger_state_version'`
    ).first<{ value: string }>()
    expect(cursor?.value).toBe('100')
  })
})

describe('combined Worker compatibility', () => {
  it(
    'runs the representative mainnet vote snapshot inside workerd',
    { timeout: 120_000 },
    async () => {
      const snapshotAccount = AccountAddress.make(
        'account_rdx12xl2meqtelz47mwp3nzd72jkwyallg5yxr9hkc75ac4qztsxulfpew'
      )
      const governance = Layer.succeed(GovernanceConfig, {
        packageAddress: PackageAddress.make(''),
        componentAddress: ComponentAddress.make(
          'component_rdx1cqnp3rptnwqjc4r7kzwkctec09jkdqa8v2rue580kw66fvt4ctpnmc'
        ),
        adminBadgeAddress: FungibleResourceAddress.make(
          'resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd'
        ),
        xrdResourceAddress: FungibleResourceAddress.make(
          'resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd'
        )
      })
      const layer = VotePowerSnapshot.Default.pipe(
        Layer.provide(MainnetGatewayApiClientLayer),
        Layer.provideMerge(governance),
        Layer.provide(
          Layer.setConfigProvider(ConfigProvider.fromJson({ NETWORK_ID: 1 }))
        ),
        Layer.provideMerge(Logger.json)
      )
      const startedAt = performance.now()
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const snapshot = yield* VotePowerSnapshot
          return yield* snapshot({
            addresses: [snapshotAccount],
            stateVersion: StateVersion.make(458723388),
            sourceConfig: getVotePowerConfig(new Date(0))
          })
        }).pipe(Effect.provide(layer))
      )
      const elapsedMs = performance.now() - startedAt
      const total = R.get(result.votePower, snapshotAccount).pipe(
        Option.map((value) => value.toFixed()),
        Option.getOrElse(() => '0')
      )

      expect(total).toBe(
        '75919.449583494071330722205151679361023735508842549230540879604'
      )
      expect(elapsedMs).toBeLessThan(20_000)
    }
  )
})
