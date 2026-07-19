import { Context, Data, Effect, Layer } from 'effect'

export class D1Failure extends Data.TaggedError('D1Failure')<{
  readonly operation: string
  readonly cause: unknown
}> {}

export class VoteDatabase extends Context.Tag('@vote-collector/VoteDatabase')<
  VoteDatabase,
  D1Database
>() {}

export const VoteDatabaseLive = (database: D1Database) =>
  Layer.succeed(VoteDatabase, database)

export const tryD1 = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new D1Failure({ operation, cause })
  })

export const all = <T>(operation: string, statement: D1PreparedStatement) =>
  tryD1(operation, () => statement.all<T>()).pipe(
    Effect.map((result) => result.results)
  )

export const first = <T>(operation: string, statement: D1PreparedStatement) =>
  tryD1(operation, () => statement.first<T>())

export const run = (operation: string, statement: D1PreparedStatement) =>
  tryD1(operation, () => statement.run())

export const batch = (
  operation: string,
  database: D1Database,
  statements: ReadonlyArray<D1PreparedStatement>
) => tryD1(operation, () => database.batch([...statements]))
