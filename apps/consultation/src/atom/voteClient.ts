import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest
} from '@effect/platform'
import { Context, Data, Effect, Layer, Schema } from 'effect'
import type { EntityId, EntityType } from 'shared/governance/brandedTypes'
import {
  type MajorityJudgmentElectionId,
  MajorityJudgmentElectionResponseSchema
} from 'shared/governance/index'
import { makeAtomRuntime } from '@/atom/makeRuntimeAtom'

const VoteResultSchema = Schema.Struct({
  vote: Schema.String,
  votePower: Schema.String
})

const GetVoteResultsResponse = Schema.Struct({
  cacheAvailable: Schema.Boolean,
  results: Schema.Array(VoteResultSchema)
})

const AccountVoteSchema = Schema.Struct({
  accountAddress: Schema.String,
  vote: Schema.String,
  votePower: Schema.String
})

const CurrentVotingPowerSchema = Schema.Struct({
  votePower: Schema.String,
  resourceBalances: Schema.Record({ key: Schema.String, value: Schema.String }),
  validatorLsuBalances: Schema.Array(
    Schema.Struct({ resourceAddress: Schema.String, amount: Schema.String })
  ),
  xrdResourceAddress: Schema.String
})

export class VoteClientError extends Data.TaggedError('VoteClientError')<{
  message: string
}> {}

export class ElectionNotIndexedYetError extends Data.TaggedError(
  'ElectionNotIndexedYetError'
)<{
  readonly electionId: MajorityJudgmentElectionId
}> {}

export class VoteClient extends Context.Tag('VoteClient')<
  VoteClient,
  {
    readonly GetVoteResults: (params: {
      type: EntityType
      entityId: EntityId
    }) => Effect.Effect<typeof GetVoteResultsResponse.Type, VoteClientError>
    readonly GetAccountVotes: (params: {
      type: EntityType
      entityId: EntityId
    }) => Effect.Effect<
      ReadonlyArray<typeof AccountVoteSchema.Type>,
      VoteClientError
    >
    readonly GetCurrentVotingPower: (params: {
      accountAddress: string
    }) => Effect.Effect<typeof CurrentVotingPowerSchema.Type, VoteClientError>
    readonly GetMajorityJudgmentElection: (params: {
      electionId: MajorityJudgmentElectionId
    }) => Effect.Effect<
      typeof MajorityJudgmentElectionResponseSchema.Type,
      VoteClientError | ElectionNotIndexedYetError
    >
  }
>() {}

const VoteClientLive = Layer.effect(
  VoteClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const baseUrl = globalThis.location.origin

    return {
      GetVoteResults: ({ type, entityId }) =>
        client
          .execute(
            HttpClientRequest.get(
              `${baseUrl}/vote-results?type=${type}&entityId=${entityId}`
            )
          )
          .pipe(
            Effect.flatMap((res) => res.json),
            Effect.flatMap(Schema.decodeUnknown(GetVoteResultsResponse)),
            Effect.scoped,
            Effect.catchAll((e) => new VoteClientError({ message: String(e) }))
          ),
      GetAccountVotes: ({ type, entityId }) =>
        client
          .execute(
            HttpClientRequest.get(
              `${baseUrl}/account-votes?type=${type}&entityId=${entityId}`
            )
          )
          .pipe(
            Effect.flatMap((res) => res.json),
            Effect.flatMap(
              Schema.decodeUnknown(Schema.Array(AccountVoteSchema))
            ),
            Effect.scoped,
            Effect.catchAll((e) => new VoteClientError({ message: String(e) }))
          ),
      GetCurrentVotingPower: ({ accountAddress }) =>
        client
          .execute(
            HttpClientRequest.get(
              `${baseUrl}/voting-power?accountAddress=${encodeURIComponent(accountAddress)}`
            )
          )
          .pipe(
            Effect.flatMap((res) => res.json),
            Effect.flatMap(Schema.decodeUnknown(CurrentVotingPowerSchema)),
            Effect.scoped,
            Effect.catchAll((e) => new VoteClientError({ message: String(e) }))
          ),
      GetMajorityJudgmentElection: ({ electionId }) =>
        client
          .execute(
            HttpClientRequest.get(
              `${baseUrl}/majority-judgment-election?electionId=${electionId}`
            )
          )
          .pipe(
            Effect.flatMap(
              (response): Effect.Effect<unknown, unknown> =>
                response.status === 404
                  ? Effect.fail(new ElectionNotIndexedYetError({ electionId }))
                  : response.json
            ),
            Effect.flatMap(
              Schema.decodeUnknown(MajorityJudgmentElectionResponseSchema)
            ),
            Effect.scoped,
            Effect.catchAll(
              (
                error
              ): Effect.Effect<
                never,
                VoteClientError | ElectionNotIndexedYetError
              > =>
                error instanceof ElectionNotIndexedYetError
                  ? Effect.fail(error)
                  : Effect.fail(new VoteClientError({ message: String(error) }))
            )
          )
    }
  })
)

export const VoteClientLayer = VoteClientLive.pipe(
  Layer.provide(FetchHttpClient.layer)
)

export const voteClientRuntime = makeAtomRuntime(VoteClientLayer)
