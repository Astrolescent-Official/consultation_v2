import { ConfigProvider, Effect, Layer, Logger } from 'effect'
import { GatewayApiClientLayer } from 'shared/gateway'
import { GovernanceConfigLayer } from 'shared/governance/index'
import { VoteDatabaseLive } from './db/d1'
import { PollService } from './poll'
import { PollLock } from './pollLock'
import { VoteCalculationRepo } from './vote-calculation/voteCalculationRepo'

export type VoteCollectorWorkerEnv = {
  readonly DB: D1Database
  readonly GOVERNANCE_COMPONENT_ADDRESS?: string
  readonly NETWORK_ID: string
  readonly ENV?: string
  readonly DEX_POSITION_CONCURRENCY?: string
  readonly LEDGER_STATE_VERSION?: string
  readonly POLL_RUN_DURATION?: string
  readonly POLL_TIMEOUT_DURATION?: string
  readonly VOTE_CALCULATION_CONCURRENCY?: string
}

const configLayer = (env: VoteCollectorWorkerEnv) => {
  const entries = Object.entries(env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  )
  return Layer.setConfigProvider(ConfigProvider.fromMap(new Map(entries)))
}

export const CronJobHandlerLayer = (env: VoteCollectorWorkerEnv) =>
  PollService.Default.pipe(
    Layer.provideMerge(PollLock.Default),
    Layer.provideMerge(GatewayApiClientLayer),
    Layer.provideMerge(GovernanceConfigLayer),
    Layer.provideMerge(VoteDatabaseLive(env.DB)),
    Layer.provideMerge(Logger.json),
    Layer.provide(configLayer(env))
  )

export const HttpHandlerLayer = (env: VoteCollectorWorkerEnv) =>
  VoteCalculationRepo.Default.pipe(
    Layer.provideMerge(VoteDatabaseLive(env.DB)),
    Layer.provideMerge(Logger.json),
    Layer.provide(configLayer(env))
  )

export const runCronEffect = <A, E>(
  env: VoteCollectorWorkerEnv,
  effect: Effect.Effect<A, E, PollService | PollLock>
) => Effect.runPromise(effect.pipe(Effect.provide(CronJobHandlerLayer(env))))

export const runHttpEffect = <A, E>(
  env: VoteCollectorWorkerEnv,
  effect: Effect.Effect<A, E, VoteCalculationRepo>
) => Effect.runPromise(effect.pipe(Effect.provide(HttpHandlerLayer(env))))
