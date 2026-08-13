import * as Sqlite from '@effect/sql-drizzle/Sqlite'
import * as DbSchema from 'db/src/schema'
import { Effect } from 'effect'

export class ORM extends Effect.Service<ORM>()('ORM', {
  effect: Sqlite.make({ schema: DbSchema })
}) {}
