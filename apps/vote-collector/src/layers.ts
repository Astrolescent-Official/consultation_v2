import { Config, Effect, Layer, Logger, ManagedRuntime, Option } from 'effect'
import { GatewayApiClientLayer } from 'shared/gateway'
import { GovernanceConfigLayer } from 'shared/governance/index'
import { DatabaseMigrations } from './db/migrate'
import { ORM } from './db/orm'
import { PgClientLive } from './db/pgClient'
import { MajorityJudgmentRepo } from './majority-judgment/repo'
import { PollService } from './poll'
import { PollLock } from './pollLock'
import { VoteCalculationRepo } from './vote-calculation/voteCalculationRepo'

const LoggerLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const ENV = (yield* Config.option(Config.string('ENV'))).pipe(
      Option.getOrNull
    )

    if (ENV === 'production') {
      return Logger.json
    } else {
      return Logger.pretty
    }
  })
)

const CronJobHandlerLayer = PollService.Default.pipe(
  Layer.provideMerge(PollLock.Default),
  Layer.provide(ORM.Default),
  Layer.provideMerge(GatewayApiClientLayer),
  Layer.provideMerge(GovernanceConfigLayer),
  Layer.provideMerge(PgClientLive),
  Layer.provideMerge(Logger.json)
)

const HttpHandlerLayer = Layer.merge(
  VoteCalculationRepo.Default,
  MajorityJudgmentRepo.Default
).pipe(
  Layer.provide(ORM.Default),
  Layer.provideMerge(PgClientLive),
  Layer.provideMerge(Logger.json)
)

export const CronRuntime = ManagedRuntime.make(CronJobHandlerLayer)
export const HttpRuntime = ManagedRuntime.make(HttpHandlerLayer)

export const HttpServerLayer = Layer.mergeAll(
  PollService.Default,
  VoteCalculationRepo.Default,
  MajorityJudgmentRepo.Default,
  DatabaseMigrations.Default
).pipe(
  Layer.provideMerge(PollLock.Default),
  Layer.provide(ORM.Default),
  Layer.provideMerge(GatewayApiClientLayer),
  Layer.provideMerge(GovernanceConfigLayer),
  Layer.provideMerge(PgClientLive),
  Layer.provideMerge(LoggerLayer)
)
