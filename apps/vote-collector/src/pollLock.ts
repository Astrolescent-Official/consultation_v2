import { Config, Data, Duration, Effect } from 'effect'
import { first, run, VoteDatabase } from './db/d1'
import { type PollLeaseIdentity, withPollLease } from './pollLease'

const LOCK_ID = 1

export class PollLockNotAcquired extends Data.TaggedError(
  'PollLockNotAcquired'
) {}

export class PollLock extends Effect.Service<PollLock>()('PollLock', {
  effect: Effect.gen(function* () {
    const database = yield* VoteDatabase
    const timeout = yield* Config.duration('POLL_TIMEOUT_DURATION').pipe(
      Config.withDefault(Duration.seconds(120)),
      Effect.orDie
    )
    const durationMs = Duration.toMillis(timeout)

    const acquireLock = Effect.gen(function* () {
      const now = Date.now()
      const lease: PollLeaseIdentity = {
        owner: crypto.randomUUID(),
        durationMs
      }
      const expiresAt = now + durationMs
      const acquired = yield* first<{ owner: string }>(
        'acquire poll lease',
        database
          .prepare(
            `INSERT INTO poll_lease (id, owner, expires_at)
             VALUES (?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               owner = excluded.owner,
               expires_at = excluded.expires_at
             WHERE poll_lease.expires_at <= ? OR poll_lease.owner = excluded.owner
             RETURNING owner`
          )
          .bind(LOCK_ID, lease.owner, expiresAt, now)
      ).pipe(Effect.orDie)

      if (acquired?.owner !== lease.owner) {
        return yield* new PollLockNotAcquired()
      }

      yield* Effect.logInfo('Poll lease acquired', {
        owner: lease.owner,
        expiresAt
      })
      return lease
    })

    const releaseLock = (lease: PollLeaseIdentity) =>
      run(
        'release poll lease',
        database
          .prepare(
            `UPDATE poll_lease
             SET owner = '', expires_at = 0
             WHERE id = ? AND owner = ?`
          )
          .bind(LOCK_ID, lease.owner)
      ).pipe(
        Effect.tap(() =>
          Effect.logInfo('Poll lease released', { owner: lease.owner })
        ),
        Effect.catchAll((error) =>
          Effect.logError('Failed to release poll lease', error)
        )
      )

    return <A, E, R>(
      effect: Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | PollLockNotAcquired, R> =>
      Effect.acquireUseRelease(
        acquireLock,
        (lease) => withPollLease(lease, effect),
        releaseLock
      )
  })
}) {}
