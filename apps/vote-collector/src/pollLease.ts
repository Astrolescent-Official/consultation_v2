import { Data, Duration, Effect, FiberRef, Option, Schedule } from 'effect'
import { batch, type D1Failure } from './db/d1'

export type PollLeaseIdentity = {
  readonly owner: string
  readonly durationMs: number
}

export class PollLeaseRequired extends Data.TaggedError('PollLeaseRequired') {}

export const currentPollLease = FiberRef.unsafeMake<
  Option.Option<PollLeaseIdentity>
>(Option.none())

const isRetryableD1Failure = (error: D1Failure) =>
  /busy|internal|network|overload|rate|reset|temporar|timeout|too many/i.test(
    String(error.cause)
  )

const d1Retry = Schedule.exponential(Duration.millis(50)).pipe(
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(2)),
  Schedule.whileInput(isRetryableD1Failure)
)

export const withPollLease = <A, E, R>(
  lease: PollLeaseIdentity,
  effect: Effect.Effect<A, E, R>
) => Effect.locally(effect, currentPollLease, Option.some(lease))

export const guardedBatch = (
  database: D1Database,
  operation: string,
  statements: ReadonlyArray<D1PreparedStatement>
) =>
  Effect.gen(function* () {
    const lease = yield* FiberRef.get(currentPollLease)
    if (Option.isNone(lease)) return yield* new PollLeaseRequired()

    const now = Date.now()
    const expiresAt = now + lease.value.durationMs
    const renew = database
      .prepare(
        `UPDATE poll_lease
         SET expires_at = ?
         WHERE id = 1 AND owner = ? AND expires_at > ?`
      )
      .bind(expiresAt, lease.value.owner, now)
    // The lease row is permanent after the first acquisition. Violating its
    // NOT NULL constraint aborts the whole D1 batch if ownership was lost.
    const assertOwnership = database
      .prepare(
        `UPDATE poll_lease
         SET owner = CASE
           WHEN owner = ? AND expires_at = ? THEN owner
           ELSE NULL
         END
         WHERE id = 1`
      )
      .bind(lease.value.owner, expiresAt)
    let retryCount = 0

    return yield* batch(operation, database, [
      renew,
      assertOwnership,
      ...statements
    ]).pipe(
      Effect.tapError((error) =>
        Effect.logWarning('D1 batch failed', {
          operation,
          retryable: isRetryableD1Failure(error),
          retryCount: ++retryCount,
          cause: String(error.cause)
        })
      ),
      Effect.retry(d1Retry)
    )
  })
