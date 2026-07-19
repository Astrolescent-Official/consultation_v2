import { Config, Duration, Effect, ParseResult, Schema } from 'effect'
import { EntityType } from 'shared/governance/index'
import {
  runCronEffect,
  runHttpEffect,
  type VoteCollectorWorkerEnv
} from './layers'
import { PollService } from './poll'
import { PollLock } from './pollLock'
import { VoteCalculationRepo } from './vote-calculation/voteCalculationRepo'

const QueryParams = Schema.Struct({
  type: EntityType,
  entityId: Schema.NumberFromString
})

const jsonHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8'
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders })

const parseQuery = (request: Request) => {
  const query = Object.fromEntries(new URL(request.url).searchParams)
  return Schema.decodeUnknown(QueryParams)(query, { errors: 'all' }).pipe(
    Effect.mapError((error) =>
      json(
        {
          error: 'Invalid query parameters',
          details: ParseResult.ArrayFormatter.formatErrorSync(error)
        },
        400
      )
    )
  )
}

export const handleVoteCollectorRequest = (
  request: Request,
  env: VoteCollectorWorkerEnv
) =>
  runHttpEffect(
    env,
    Effect.gen(function* () {
      const params = yield* parseQuery(request)
      const repo = yield* VoteCalculationRepo
      const pathname = new URL(request.url).pathname

      if (pathname === '/vote-results') {
        return json(
          yield* repo.getResultsByEntity(params.type, params.entityId)
        )
      }
      if (pathname === '/account-votes') {
        return json(
          yield* repo.getAccountVotesByEntity(params.type, params.entityId)
        )
      }
      return json({ error: 'Not found' }, 404)
    }).pipe(
      Effect.catchAll((response) => Effect.succeed(response)),
      Effect.catchAllDefect((defect) =>
        Effect.logError('Unhandled vote API defect', defect).pipe(
          Effect.as(json({ error: 'Internal server error' }, 500))
        )
      )
    )
  )

export const runScheduledPoll = (
  env: VoteCollectorWorkerEnv,
  schedule?: { readonly cron: string; readonly scheduledTime: number }
) =>
  runCronEffect(
    env,
    Effect.gen(function* () {
      const withPollLock = yield* PollLock
      const poll = yield* PollService
      const runDuration = yield* Config.duration('POLL_RUN_DURATION').pipe(
        Config.withDefault(Duration.seconds(25)),
        Effect.orDie
      )
      yield* withPollLock(poll()).pipe(Effect.timeout(runDuration))
    }).pipe(
      Effect.annotateLogs({
        cron: schedule?.cron ?? 'manual',
        scheduledTime: schedule?.scheduledTime ?? Date.now()
      }),
      Effect.catchTag('PollLockNotAcquired', () =>
        Effect.logInfo('Poll lease held by another invocation; skipping')
      ),
      Effect.tapErrorCause((cause) => Effect.logError('Poll failed', cause))
    )
  )
