import * as D1Client from '@effect/sql-d1/D1Client'
import {
  type GatewayApiClient,
  GetFungibleBalance,
  GetNonFungibleBalanceService,
  GetValidators
} from '@radix-effects/gateway'
import { ConfigProvider, Effect, Layer, Logger } from 'effect'
import { GatewayApiClientLayer } from 'shared/gateway'
import {
  type GovernanceConfig,
  GovernanceConfigLayer
} from 'shared/governance/index'
import { VoteDatabaseLive } from './db/d1'
import { ORM } from './db/orm'
import { MajorityJudgmentRepo } from './majority-judgment/repo'
import { PollService } from './poll'
import { PollLock } from './pollLock'
import { VoteCalculationRepo } from './vote-calculation/voteCalculationRepo'
import { VotePowerSnapshot } from './vote-calculation/votePowerSnapshot'

export type VotingWorkerEnv = Env

const configLayer = (env: VotingWorkerEnv) => {
  const entries = Object.entries(env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  )
  return Layer.setConfigProvider(ConfigProvider.fromMap(new Map(entries)))
}

const databaseLayer = (env: VotingWorkerEnv) =>
  Layer.mergeAll(VoteDatabaseLive(env.DB), D1Client.layer({ db: env.DB }))

const CronJobHandlerLayer = (env: VotingWorkerEnv) => {
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

const HttpHandlerLayer = (env: VotingWorkerEnv) => {
  const database = databaseLayer(env)
  const votePowerServices = Layer.mergeAll(
    GatewayApiClientLayer,
    Layer.mergeAll(
      VotePowerSnapshot.Default,
      GetFungibleBalance.Default,
      GetNonFungibleBalanceService.Default,
      GetValidators.Default
    ).pipe(Layer.provide(GatewayApiClientLayer))
  )

  return Layer.mergeAll(
    VoteCalculationRepo.Default,
    MajorityJudgmentRepo.Default,
    votePowerServices
  ).pipe(
    Layer.provide(ORM.Default),
    Layer.provideMerge(database),
    Layer.provideMerge(GovernanceConfigLayer),
    Layer.provideMerge(Logger.json),
    Layer.provide(configLayer(env))
  )
}

export const runCronEffect = <A, E>(
  env: VotingWorkerEnv,
  effect: Effect.Effect<A, E, PollService | PollLock>
) => Effect.runPromise(effect.pipe(Effect.provide(CronJobHandlerLayer(env))))

export const runHttpEffect = <A, E>(
  env: VotingWorkerEnv,
  effect: Effect.Effect<
    A,
    E,
    | VoteCalculationRepo
    | MajorityJudgmentRepo
    | VotePowerSnapshot
    | GatewayApiClient
    | GetFungibleBalance
    | GetNonFungibleBalanceService
    | GetValidators
    | GovernanceConfig
  >
) => Effect.runPromise(effect.pipe(Effect.provide(HttpHandlerLayer(env))))
