import { GatewayApiClient } from '@radix-effects/gateway'
import { StateVersion } from '@radix-effects/shared'
import { Config, Effect, Option } from 'effect'
import { first, VoteDatabase } from './db/d1'
import { guardedBatch } from './pollLease'

const CURSOR_KEY = 'ledger_state_version'
const LAST_OVERRIDE_KEY = 'ledger_state_version:last_override'

export class LedgerCursor extends Effect.Service<LedgerCursor>()(
  'LedgerCursor',
  {
    effect: Effect.gen(function* () {
      const database = yield* VoteDatabase
      const gateway = yield* GatewayApiClient
      const overrideSv = yield* Config.option(
        Config.number('LEDGER_STATE_VERSION')
      )

      const upsertStatements = (entries: ReadonlyArray<[string, string]>) =>
        entries.map(([key, value]) =>
          database
            .prepare(
              `INSERT INTO config (key, value)
               VALUES (?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value`
            )
            .bind(key, value)
        )

      const upsertConfig = (entries: ReadonlyArray<[string, string]>) =>
        guardedBatch(
          database,
          'write ledger cursor configuration',
          upsertStatements(entries)
        ).pipe(Effect.asVoid, Effect.orDie)

      const readConfig = (key: string) =>
        first<{ value: string }>(
          'read ledger cursor configuration',
          database.prepare('SELECT value FROM config WHERE key = ?').bind(key)
        ).pipe(Effect.map(Option.fromNullable), Effect.orDie)

      const applyOverride = (stateVersion: number) =>
        Effect.gen(function* () {
          const lastOverride = yield* readConfig(LAST_OVERRIDE_KEY)
          if (
            Option.isSome(lastOverride) &&
            Number(lastOverride.value.value) === stateVersion
          ) {
            return Option.none()
          }

          yield* upsertConfig([
            [CURSOR_KEY, String(stateVersion)],
            [LAST_OVERRIDE_KEY, String(stateVersion)]
          ])
          yield* Effect.logInfo('Ledger state override applied', {
            stateVersion
          })
          return Option.some(StateVersion.make(stateVersion))
        })

      const getOrBootstrap = () =>
        Effect.gen(function* () {
          if (Option.isSome(overrideSv)) {
            const overrideResult = yield* applyOverride(overrideSv.value)
            if (Option.isSome(overrideResult)) return overrideResult.value
          }

          const existing = yield* readConfig(CURSOR_KEY)
          if (Option.isSome(existing)) {
            return StateVersion.make(Number(existing.value.value))
          }

          const current = yield* gateway.status
            .getCurrent()
            .pipe(Effect.catchAll(Effect.die))
          const stateVersion = StateVersion.make(
            current.ledger_state.state_version
          )

          yield* upsertConfig([[CURSOR_KEY, String(stateVersion)]])
          yield* Effect.logInfo('Ledger cursor bootstrapped', { stateVersion })
          return stateVersion
        })

      const advance = (stateVersion: StateVersion) =>
        upsertConfig([[CURSOR_KEY, String(stateVersion)]])

      return { getOrBootstrap, advance } as const
    })
  }
) {}
