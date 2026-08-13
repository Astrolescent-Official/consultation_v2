import * as D1Client from '@effect/sql-d1/D1Client'
import { ConfigProvider, Effect, Layer, Logger } from 'effect'
import { GatewayApiClientLayer } from 'shared/gateway'
import { GovernanceConfigLayer } from 'shared/governance/index'
import { VoteDatabaseLive } from './db/d1'
import { ORM } from './db/orm'
import { MajorityJudgmentRepo } from './majority-judgment/repo'
import { PollService } from './poll'
import { PollLock } from './pollLock'
import { VoteCalculationRepo } from './vote-calculation/voteCalculationRepo'

export type VoteCollectorWorkerEnv = Env

const configLayer = (env: VoteCollectorWorkerEnv) => {
  const entries = Object.entries(env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  )
  return Layer.setConfigProvider(ConfigProvider.fromMap(new Map(entries)))
}

const databaseLayer = (env: VoteCollectorWorkerEnv) =>
  Layer.mergeAll(VoteDatabaseLive(env.DB), D1Client.layer({ db: env.DB }))

export const CronJobHandlerLayer = (env: VoteCollectorWorkerEnv) => {
  const database = databaseLayer(env)

  return PollService.Default.pipe(
    Layer.provideMerge(PollLock.Default),
    Layer.provide(ORM.Default),
    Layer.provideMerge(GatewayApiClientLayer),
    Layer.provideMerge(GovernanceConfigLayer),
    Layer.provideMerge(database),
    Layer.provideMerge(Logger.json),
    Layer.provide(configLayer(env))
  )
}

export const HttpHandlerLayer = (env: VoteCollectorWorkerEnv) => {
  const database = databaseLayer(env)

  return Layer.merge(
    VoteCalculationRepo.Default,
    MajorityJudgmentRepo.Default
  ).pipe(
    Layer.provide(ORM.Default),
    Layer.provideMerge(database),
    Layer.provideMerge(Logger.json),
    Layer.provide(configLayer(env))
  )
}

export const runCronEffect = <A, E>(
  env: VoteCollectorWorkerEnv,
  effect: Effect.Effect<A, E, PollService | PollLock>
) => Effect.runPromise(effect.pipe(Effect.provide(CronJobHandlerLayer(env))))

export const runHttpEffect = <A, E>(
  env: VoteCollectorWorkerEnv,
  effect: Effect.Effect<A, E, VoteCalculationRepo | MajorityJudgmentRepo>
) => Effect.runPromise(effect.pipe(Effect.provide(HttpHandlerLayer(env))))
