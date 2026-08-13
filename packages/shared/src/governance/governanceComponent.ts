import {
  GetComponentStateService,
  GetKeyValueStoreService,
  GetLedgerStateService,
  KeyValueStoreDataService,
  StateEntityDetails
} from '@radix-effects/gateway'
import {
  AccountAddress,
  TransactionManifestString
} from '@radix-effects/shared'
import type { StateKeyValueStoreDataResponseItem } from '@radixdlt/babylon-gateway-api-sdk'
import { Array as A, Data, Effect, Option, pipe, Schema } from 'effect'
import { parseSbor } from '../helpers/parseSbor'
import {
  Governance,
  GovernanceParameterSetKeyValueStoreKey,
  GovernanceParameterSetKeyValueStoreValue,
  KeyValueStoreAddress,
  MajorityJudgmentElectionKeyValueStoreKey,
  MajorityJudgmentElectionKeyValueStoreValue,
  ProposalKeyValueStoreValue,
  TemperatureCheckKeyValueStoreKey,
  TemperatureCheckKeyValueStoreValue,
  TemperatureCheckVoteKeyValueStoreKey,
  TemperatureCheckVoteKeyValueStoreValue
} from '../schemas'
import { AdminBadgeService, renderAdminBadgeProof } from './adminBadge'
import type { ProposalId, TemperatureCheckId } from './brandedTypes'
import { GovernanceConfig } from './config'
import {
  encodeManifestString,
  renderCandidateGrades,
  renderCandidateOrder,
  renderGovernanceParameterSetInput,
  renderInstant,
  renderParameterSetIdOption,
  renderTemperatureCheckDraft
} from './governanceManifests'
import {
  type MakeMajorityJudgmentElectionInput,
  MakeMajorityJudgmentElectionInputSchema,
  type MakeMajorityJudgmentTieResolutionInput,
  MakeMajorityJudgmentTieResolutionInputSchema,
  type MakeMajorityJudgmentVoteInput,
  MakeMajorityJudgmentVoteInputSchema,
  type StartMajorityJudgmentRerunInput,
  StartMajorityJudgmentRerunInputSchema,
  type ToggleMajorityJudgmentElectionHiddenInput,
  ToggleMajorityJudgmentElectionHiddenInputSchema
} from './majorityJudgment'
import { makeVoteIndexKeys } from './makeVoteIndexKeys'
import {
  DEFAULT_PARAMETER_SET_ID,
  GovernanceParameterSetSchema,
  MajorityJudgmentElectionSchema,
  MajorityJudgmentVoteRecord,
  MajorityJudgmentVoteValueSchema,
  type MakeAddGovernanceParameterSetInput,
  MakeAddGovernanceParameterSetInputSchema,
  type MakeProposalVoteInput,
  MakeProposalVoteInputSchema,
  type MakeRetireGovernanceParameterSetInput,
  MakeRetireGovernanceParameterSetInputSchema,
  type MakeTemperatureCheckInput,
  MakeTemperatureCheckInputSchema,
  type MakeTemperatureCheckVoteInput,
  MakeTemperatureCheckVoteInputSchema,
  type MakeUpdateGovernanceParameterSetInput,
  MakeUpdateGovernanceParameterSetInputSchema,
  ProposalSchema,
  ProposalVoteRecord,
  ProposalVoteValueSchema,
  partitionGovernanceParameterSets,
  type RecordTemperatureCheckOutcomeInput,
  RecordTemperatureCheckOutcomeInputSchema,
  TemperatureCheckSchema,
  TemperatureCheckVoteRecord,
  TemperatureCheckVoteSchema,
  TemperatureCheckVoteValueSchema
} from './schemas'

export const makeMajorityJudgmentElectionKey = (electionId: number) => ({
  key_json: { kind: 'U64' as const, value: electionId.toString() }
})

export const makeMajorityJudgmentVoterKeys = (
  accounts: ReadonlyArray<AccountAddress>
) =>
  accounts.map((account) => ({
    key_json: { kind: 'Reference' as const, value: account }
  }))

export class KeyValueStoreNotFoundError extends Data.TaggedError(
  'KeyValueStoreNotFoundError'
)<{
  message: string
}> {}

class ComponentStateNotFoundError extends Data.TaggedError(
  'ComponentStateNotFoundError'
)<{
  message: string
}> {}

class TemperatureCheckNotFoundError extends Data.TaggedError(
  'TemperatureCheckNotFoundError'
)<{
  message: string
}> {}

class ProposalNotFoundError extends Data.TaggedError('ProposalNotFoundError')<{
  message: string
}> {}

export class MajorityJudgmentElectionNotFoundError extends Data.TaggedError(
  'MajorityJudgmentElectionNotFoundError'
)<{
  message: string
}> {}

export class MissingMajorityJudgmentVoteRecordsError extends Data.TaggedError(
  'MissingMajorityJudgmentVoteRecordsError'
)<{
  readonly fromIndexInclusive: number
  readonly toIndexInclusive: number
  readonly missingVoteIds: ReadonlyArray<number>
  readonly unexpectedVoteIds: ReadonlyArray<number>
}> {}

export const validateMajorityJudgmentVoteSlice = (input: {
  readonly fromIndexInclusive: number
  readonly toIndexInclusive: number
  readonly voteIds: ReadonlyArray<number>
}) => {
  const expectedVoteIds = Array.from(
    {
      length: input.toIndexInclusive - input.fromIndexInclusive + 1
    },
    (_, index) => input.fromIndexInclusive + index
  )
  const actualVoteIds = new Set(input.voteIds)
  const expectedVoteIdSet = new Set(expectedVoteIds)
  const missingVoteIds = expectedVoteIds.filter(
    (voteId) => !actualVoteIds.has(voteId)
  )
  const unexpectedVoteIds = input.voteIds.filter(
    (voteId) => !expectedVoteIdSet.has(voteId)
  )

  return missingVoteIds.length === 0 &&
    unexpectedVoteIds.length === 0 &&
    actualVoteIds.size === input.voteIds.length
    ? Effect.void
    : Effect.fail(
        new MissingMajorityJudgmentVoteRecordsError({
          fromIndexInclusive: input.fromIndexInclusive,
          toIndexInclusive: input.toIndexInclusive,
          missingVoteIds,
          unexpectedVoteIds
        })
      )
}

export class AdminBadgeNotFoundError extends Data.TaggedError(
  'AdminBadgeNotFoundError'
)<{
  message: string
}> {}

export class GovernanceComponent extends Effect.Service<GovernanceComponent>()(
  'GovernanceComponent',
  {
    dependencies: [
      GetKeyValueStoreService.Default,
      GetLedgerStateService.Default,
      StateEntityDetails.Default,
      GetComponentStateService.Default,
      KeyValueStoreDataService.Default,
      AdminBadgeService.Default
    ],
    effect: Effect.gen(function* () {
      const keyValueStore = yield* GetKeyValueStoreService
      const keyValueStoreDataService = yield* KeyValueStoreDataService
      const getLedgerState = yield* GetLedgerStateService

      const getComponentStateService = yield* GetComponentStateService
      const adminBadgeService = yield* AdminBadgeService
      const config = yield* GovernanceConfig

      const makeAdminBadgeProof = (accountAddress: AccountAddress) =>
        adminBadgeService.getForAccount(accountAddress).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(
                  new AdminBadgeNotFoundError({
                    message: `Account ${accountAddress} does not hold the admin badge`
                  })
                ),
              onSome: (badge) =>
                Effect.succeed(
                  renderAdminBadgeProof(
                    accountAddress,
                    config.adminBadgeAddress,
                    badge
                  )
                )
            })
          )
        )

      const getComponentState = (atLedgerState?: { state_version: number }) =>
        getComponentStateService
          .run(
            atLedgerState === undefined
              ? {
                  addresses: [config.componentAddress],
                  schema: Governance
                }
              : {
                  addresses: [config.componentAddress],
                  at_ledger_state: atLedgerState,
                  schema: Governance
                }
          )
          .pipe(
            Effect.map((result) =>
              pipe(
                result,
                A.head,
                Option.map((item) => item.state),
                Option.getOrThrowWith(
                  () =>
                    new ComponentStateNotFoundError({
                      message: 'Component state not found'
                    })
                )
              )
            )
          )

      const getGovernanceParameterSets = () =>
        Effect.gen(function* () {
          const ledgerState = yield* getLedgerState({})
          const atLedgerState = { state_version: ledgerState.state_version }
          const componentState = yield* getComponentState(atLedgerState)
          const registry = yield* keyValueStore({
            address: componentState.parameter_sets,
            at_ledger_state: atLedgerState
          })

          const parameterSets = yield* Effect.forEach(
            registry.entries,
            Effect.fn(function* (entry) {
              const [id, value] = yield* Effect.all(
                [
                  parseSbor(
                    entry.key.programmatic_json,
                    GovernanceParameterSetKeyValueStoreKey
                  ),
                  parseSbor(
                    entry.value.programmatic_json,
                    GovernanceParameterSetKeyValueStoreValue
                  )
                ],
                { concurrency: 2 }
              )

              return yield* Schema.decodeUnknown(GovernanceParameterSetSchema)({
                id,
                ...value
              })
            }),
            { concurrency: 10 }
          )

          return partitionGovernanceParameterSets(parameterSets)
        })

      const getTemperatureChecks = () =>
        getComponentState().pipe(
          Effect.flatMap((componentState) =>
            componentState.temperature_check_count === 0
              ? Effect.succeed([])
              : keyValueStore({
                  address: componentState.temperature_checks
                }).pipe(Effect.map((result) => result.entries))
          ),
          Effect.map((result) =>
            pipe(
              result,
              A.map((entry) =>
                Effect.all(
                  [
                    parseSbor(
                      entry.key.programmatic_json,
                      TemperatureCheckKeyValueStoreKey
                    ),
                    parseSbor(
                      entry.value.programmatic_json,
                      TemperatureCheckKeyValueStoreValue
                    )
                  ],
                  { concurrency: 2 }
                ).pipe(
                  Effect.flatMap(([key, value]) =>
                    Schema.decodeUnknownEither(TemperatureCheckSchema)({
                      id: key,
                      ...value
                    })
                  )
                )
              )
            )
          ),
          Effect.flatMap(Effect.all)
        )

      const getTemperatureCheckById = (
        id: TemperatureCheckId,
        atLedgerState?: { state_version: number }
      ) =>
        Effect.gen(function* () {
          const keyValueStoreAddress = yield* getComponentState(
            atLedgerState
          ).pipe(
            Effect.map((result) =>
              KeyValueStoreAddress.make(result.temperature_checks)
            )
          )

          const temperatureCheck = yield* keyValueStoreDataService({
            key_value_store_address: keyValueStoreAddress,
            keys: [
              {
                key_json: { kind: 'U64' as const, value: id.toString() }
              }
            ],
            ...(atLedgerState === undefined
              ? {}
              : { at_ledger_state: atLedgerState })
          }).pipe(
            Effect.map((result) =>
              pipe(
                result,
                A.head,
                Option.flatMap((item) => A.head(item.entries)),
                Option.flatMap((item) =>
                  Option.fromNullable(item.value.programmatic_json)
                ),
                Option.getOrThrowWith(
                  () =>
                    new TemperatureCheckNotFoundError({
                      message: 'Temperature check not found'
                    })
                )
              )
            ),
            Effect.flatMap((sbor) => {
              return parseSbor(sbor, TemperatureCheckKeyValueStoreValue)
            }),
            Effect.flatMap((parsed) => {
              return Schema.decodeUnknown(TemperatureCheckSchema)({
                ...parsed,
                id
              })
            })
          )

          return temperatureCheck
        })

      const getAllTemperatureChecksVotes = (input: {
        keyValueStoreAddress: KeyValueStoreAddress
      }) =>
        keyValueStore({
          address: input.keyValueStoreAddress
        }).pipe(
          Effect.map((result) =>
            pipe(
              result.entries,
              A.map((entry) =>
                Effect.all(
                  [
                    parseSbor(
                      entry.key.programmatic_json,
                      TemperatureCheckVoteKeyValueStoreKey
                    ),
                    parseSbor(
                      entry.value.programmatic_json,
                      TemperatureCheckVoteKeyValueStoreValue
                    )
                  ],
                  { concurrency: 2 }
                ).pipe(
                  Effect.flatMap(([key, value]) =>
                    Schema.decodeUnknownEither(TemperatureCheckVoteSchema)({
                      id: key,
                      voter: value.voter,
                      vote: value.vote
                    })
                  )
                )
              )
            )
          ),
          Effect.flatMap(Effect.all)
        )

      const makeTemperatureCheckManifest = (input: MakeTemperatureCheckInput) =>
        Effect.gen(function* () {
          const parsedInput = yield* Schema.decodeUnknown(
            MakeTemperatureCheckInputSchema
          )(input)
          const draft = renderTemperatureCheckDraft(parsedInput)
          const parameterSetId = renderParameterSetIdOption(
            parsedInput.parameterSetId === DEFAULT_PARAMETER_SET_ID
              ? undefined
              : parsedInput.parameterSetId
          )

          return TransactionManifestString.make(`
CALL_METHOD
  Address(${encodeManifestString(config.componentAddress)})
  "make_temperature_check"
  Address(${encodeManifestString(parsedInput.authorAccount)})
  ${draft}
  ${parameterSetId}
;
CALL_METHOD
  Address(${encodeManifestString(parsedInput.authorAccount)})
  "deposit_batch"
  Expression("ENTIRE_WORKTOP")
;
          `)
        })

      const makeTemperatureCheckVoteManifest = (
        input: MakeTemperatureCheckVoteInput
      ) =>
        Effect.gen(function* () {
          const parsedInput = yield* Schema.decodeUnknown(
            MakeTemperatureCheckVoteInputSchema
          )(input)

          return TransactionManifestString.make(`
            CALL_METHOD
              Address("${config.componentAddress}")
              "vote_on_temperature_check"
              Address("${parsedInput.accountAddress}") # account to vote with
              ${parsedInput.temperatureCheckId}u64 # temperature check id
              Enum<${parsedInput.vote === 'For' ? 0 : 1}u8>() # for or against temp check, this is "for", Enum<1u8>() would be "against"
            ;

            CALL_METHOD
              Address("${parsedInput.accountAddress}")
              "deposit_batch"
              Expression("ENTIRE_WORKTOP")
            ;
          `)
        })

      const getTemperatureCheckVotesByAccounts = (input: {
        keyValueStoreAddress: KeyValueStoreAddress
        accounts: AccountAddress[]
      }) =>
        Effect.gen(function* () {
          const AccountAddressSchema = Schema.Struct({ value: AccountAddress })

          return yield* keyValueStoreDataService({
            key_value_store_address: input.keyValueStoreAddress,
            keys: input.accounts.map((address) => ({
              key_json: { kind: 'Reference' as const, value: address }
            }))
          }).pipe(
            Effect.map((result) =>
              pipe(
                result,
                A.head,
                Option.map((item) => item.entries),
                Option.getOrElse(() =>
                  A.empty<StateKeyValueStoreDataResponseItem>()
                )
              )
            ),
            Effect.flatMap(
              Effect.forEach(
                Effect.fnUntraced(function* (item) {
                  const address = yield* Schema.decodeUnknown(
                    AccountAddressSchema
                  )(item.key.programmatic_json).pipe(
                    Effect.map((result) => result.value)
                  )

                  const vote = yield* Schema.decodeUnknown(
                    TemperatureCheckVoteValueSchema
                  )(item.value.programmatic_json)

                  return {
                    address,
                    vote
                  }
                })
              )
            )
          )
        })

      const getTemperatureCheckVotesByIndex = (input: {
        keyValueStoreAddress: KeyValueStoreAddress
        fromIndexInclusive: number
        toIndexInclusive: number
      }) =>
        Effect.gen(function* () {
          return yield* keyValueStoreDataService({
            key_value_store_address: input.keyValueStoreAddress,
            keys: makeVoteIndexKeys(
              input.fromIndexInclusive,
              input.toIndexInclusive
            )
          }).pipe(
            Effect.map((result) =>
              pipe(
                result,
                A.head,
                Option.map((item) => item.entries),
                Option.getOrElse(() =>
                  A.empty<StateKeyValueStoreDataResponseItem>()
                )
              )
            ),
            Effect.flatMap(
              Effect.forEach(
                Effect.fnUntraced(function* (item) {
                  const { accountAddress, vote, replacingVoteId } =
                    yield* Schema.decodeUnknown(TemperatureCheckVoteRecord)(
                      item.value.programmatic_json
                    )

                  return {
                    accountAddress,
                    vote,
                    replacingVoteId
                  }
                }),
                { concurrency: 10 }
              )
            ),
            Effect.orDie
          )
        })

      const getProposalVotesByIndex = (input: {
        keyValueStoreAddress: KeyValueStoreAddress
        fromIndexInclusive: number
        toIndexInclusive: number
      }) =>
        Effect.gen(function* () {
          return yield* keyValueStoreDataService({
            key_value_store_address: input.keyValueStoreAddress,
            keys: makeVoteIndexKeys(
              input.fromIndexInclusive,
              input.toIndexInclusive
            )
          }).pipe(
            Effect.map((result) =>
              pipe(
                result,
                A.head,
                Option.map((item) => item.entries),
                Option.getOrElse(() =>
                  A.empty<StateKeyValueStoreDataResponseItem>()
                )
              )
            ),
            Effect.flatMap(
              Effect.forEach(
                Effect.fnUntraced(function* (item) {
                  const { accountAddress, options, replacingVoteId } =
                    yield* Schema.decodeUnknown(ProposalVoteRecord)(
                      item.value.programmatic_json
                    )

                  return {
                    accountAddress,
                    options,
                    replacingVoteId
                  }
                }),
                { concurrency: 10 }
              )
            ),
            Effect.orDie
          )
        })

      const getGovernanceState = () =>
        Effect.gen(function* () {
          const componentState = yield* getComponentState()
          return {
            parameterSetsKvs: KeyValueStoreAddress.make(
              componentState.parameter_sets
            ),
            temperatureCheckCount: componentState.temperature_check_count,
            proposalCount: componentState.proposal_count,
            temperatureChecksKvs: KeyValueStoreAddress.make(
              componentState.temperature_checks
            ),
            proposalsKvs: KeyValueStoreAddress.make(componentState.proposals),
            majorityJudgmentElectionCount:
              componentState.majority_judgment_election_count,
            majorityJudgmentElectionsKvs: KeyValueStoreAddress.make(
              componentState.majority_judgment_elections
            )
          }
        })

      const getMajorityJudgmentElections = () =>
        Effect.gen(function* () {
          const ledgerState = yield* getLedgerState({})
          const atLedgerState = { state_version: ledgerState.state_version }
          const componentState = yield* getComponentState(atLedgerState)
          if (componentState.majority_judgment_election_count === 0) {
            return []
          }
          const registry = yield* keyValueStore({
            address: componentState.majority_judgment_elections,
            at_ledger_state: atLedgerState
          })

          return yield* Effect.forEach(
            registry.entries,
            Effect.fn(function* (entry) {
              const [id, value] = yield* Effect.all(
                [
                  parseSbor(
                    entry.key.programmatic_json,
                    MajorityJudgmentElectionKeyValueStoreKey
                  ),
                  parseSbor(
                    entry.value.programmatic_json,
                    MajorityJudgmentElectionKeyValueStoreValue
                  )
                ],
                { concurrency: 2 }
              )
              return yield* Schema.decodeUnknown(
                MajorityJudgmentElectionSchema
              )({ id, ...value })
            }),
            { concurrency: 10 }
          )
        })

      const getMajorityJudgmentElectionById = (
        electionId: number,
        atLedgerStateInput?: { state_version: number }
      ) =>
        Effect.gen(function* () {
          const atLedgerState = atLedgerStateInput ?? {
            state_version: (yield* getLedgerState({})).state_version
          }
          const componentState = yield* getComponentState(atLedgerState)
          const responses = yield* keyValueStoreDataService({
            key_value_store_address: componentState.majority_judgment_elections,
            keys: [makeMajorityJudgmentElectionKey(electionId)],
            at_ledger_state: atLedgerState
          })
          const programmaticJson = yield* pipe(
            responses,
            A.flatMap((response) => response.entries),
            A.head,
            Option.flatMap((entry) =>
              Option.fromNullable(entry.value.programmatic_json)
            ),
            Option.match({
              onNone: () =>
                Effect.fail(
                  new MajorityJudgmentElectionNotFoundError({
                    message: `Majority Judgment election ${electionId} not found`
                  })
                ),
              onSome: Effect.succeed
            })
          )
          const value = yield* parseSbor(
            programmaticJson,
            MajorityJudgmentElectionKeyValueStoreValue
          )
          return yield* Schema.decodeUnknown(MajorityJudgmentElectionSchema)({
            id: electionId,
            ...value
          })
        })

      const getMajorityJudgmentVotesByIndex = (input: {
        keyValueStoreAddress: KeyValueStoreAddress
        fromIndexInclusive: number
        toIndexInclusive: number
        atLedgerState?: { state_version: number }
      }) =>
        Effect.gen(function* () {
          const votes = yield* keyValueStoreDataService({
            key_value_store_address: input.keyValueStoreAddress,
            keys: makeVoteIndexKeys(
              input.fromIndexInclusive,
              input.toIndexInclusive
            ),
            ...(input.atLedgerState === undefined
              ? {}
              : { at_ledger_state: input.atLedgerState })
          }).pipe(
            Effect.map(A.flatMap((response) => response.entries)),
            Effect.flatMap(
              Effect.forEach(
                Effect.fn('GovernanceComponent.decodeMajorityJudgmentVote')(
                  function* (item) {
                    const key = yield* Schema.decodeUnknown(
                      Schema.Struct({ value: Schema.NumberFromString })
                    )(item.key.programmatic_json)
                    const vote = yield* Schema.decodeUnknown(
                      MajorityJudgmentVoteRecord
                    )(item.value.programmatic_json)
                    return { voteId: key.value, ...vote }
                  }
                ),
                { concurrency: 10 }
              )
            )
          )

          yield* validateMajorityJudgmentVoteSlice({
            fromIndexInclusive: input.fromIndexInclusive,
            toIndexInclusive: input.toIndexInclusive,
            voteIds: votes.map(({ voteId }) => voteId)
          })
          return votes
        })

      const getMajorityJudgmentVoterEntriesByAccounts = (input: {
        keyValueStoreAddress: KeyValueStoreAddress
        accounts: ReadonlyArray<AccountAddress>
        atLedgerState?: { state_version: number }
      }) => {
        if (A.isEmptyReadonlyArray(input.accounts)) {
          return Effect.succeed([])
        }
        return keyValueStoreDataService({
          key_value_store_address: input.keyValueStoreAddress,
          keys: makeMajorityJudgmentVoterKeys(input.accounts),
          ...(input.atLedgerState === undefined
            ? {}
            : { at_ledger_state: input.atLedgerState })
        }).pipe(
          Effect.map(A.flatMap((response) => response.entries)),
          Effect.flatMap(
            Effect.forEach(
              Effect.fn('GovernanceComponent.decodeMajorityJudgmentVoter')(
                function* (item) {
                  const key = yield* Schema.decodeUnknown(
                    Schema.Struct({ value: AccountAddress })
                  )(item.key.programmatic_json)
                  const entry = yield* Schema.decodeUnknown(
                    MajorityJudgmentVoteValueSchema
                  )(item.value.programmatic_json)
                  return { accountAddress: key.value, ...entry }
                }
              ),
              { concurrency: 10 }
            )
          )
        )
      }

      const getProposalById = (id: ProposalId) =>
        Effect.gen(function* () {
          const keyValueStoreAddress = yield* getComponentState().pipe(
            Effect.map((result) => KeyValueStoreAddress.make(result.proposals))
          )

          const proposal = yield* keyValueStoreDataService({
            key_value_store_address: keyValueStoreAddress,
            keys: [
              {
                key_json: { kind: 'U64' as const, value: id.toString() }
              }
            ]
          }).pipe(
            Effect.map((result) =>
              pipe(
                result,
                A.head,
                Option.flatMap((item) =>
                  Option.fromNullable(item.entries[0]?.value.programmatic_json)
                ),
                Option.getOrThrowWith(
                  () =>
                    new ProposalNotFoundError({
                      message: 'Proposal not found'
                    })
                )
              )
            ),
            Effect.flatMap((sbor) => {
              return parseSbor(sbor, ProposalKeyValueStoreValue)
            }),
            Effect.flatMap((parsed) => {
              return Schema.decodeUnknown(ProposalSchema)({
                ...parsed,
                id
              })
            })
          )

          return proposal
        })

      const getPaginatedTemperatureChecks = (input: {
        page: number
        pageSize: number
        sortOrder?: 'asc' | 'desc'
      }) =>
        Effect.gen(function* () {
          const { temperatureCheckCount, temperatureChecksKvs } =
            yield* getGovernanceState()

          const sortOrder = input.sortOrder ?? 'desc'

          // Calculate which IDs to fetch based on sort order
          // IDs are 0-indexed: if count is 10, IDs are 0-9
          let startId: number
          let endId: number
          let ids: number[]

          if (sortOrder === 'desc') {
            // Newest first (highest ID first)
            startId =
              temperatureCheckCount - 1 - (input.page - 1) * input.pageSize
            endId = Math.max(startId - input.pageSize + 1, 0)

            if (startId < 0) {
              return {
                items: [],
                totalCount: temperatureCheckCount,
                page: input.page,
                pageSize: input.pageSize,
                totalPages: Math.ceil(temperatureCheckCount / input.pageSize)
              }
            }

            ids = A.makeBy(startId - endId + 1, (i) => startId - i)
          } else {
            // Oldest first (lowest ID first)
            startId = (input.page - 1) * input.pageSize
            endId = Math.min(
              startId + input.pageSize - 1,
              temperatureCheckCount - 1
            )

            if (startId >= temperatureCheckCount) {
              return {
                items: [],
                totalCount: temperatureCheckCount,
                page: input.page,
                pageSize: input.pageSize,
                totalPages: Math.ceil(temperatureCheckCount / input.pageSize)
              }
            }

            ids = A.makeBy(endId - startId + 1, (i) => startId + i)
          }

          const keys = ids.map((id) => ({
            key_json: { kind: 'U64' as const, value: id.toString() }
          }))

          const items = yield* keyValueStoreDataService({
            key_value_store_address: temperatureChecksKvs,
            keys
          }).pipe(
            Effect.map((result) =>
              pipe(
                result,
                A.head,
                Option.map((item) => item.entries),
                Option.getOrElse(() => [])
              )
            ),
            Effect.flatMap((entries) =>
              Effect.all(
                entries.map((entry, index) =>
                  pipe(
                    Option.fromNullable(entry.value.programmatic_json),
                    Option.match({
                      onNone: () => Effect.succeed(Option.none()),
                      onSome: (sbor) =>
                        parseSbor(
                          sbor,
                          TemperatureCheckKeyValueStoreValue
                        ).pipe(
                          Effect.flatMap((parsed) =>
                            Schema.decodeUnknown(TemperatureCheckSchema)({
                              ...parsed,
                              id: ids[index]
                            })
                          ),
                          Effect.map(Option.some)
                        )
                    })
                  )
                ),
                { concurrency: 'unbounded' }
              )
            ),
            Effect.map(A.filterMap((x) => x))
          )

          return {
            items,
            totalCount: temperatureCheckCount,
            page: input.page,
            pageSize: input.pageSize,
            totalPages: Math.ceil(temperatureCheckCount / input.pageSize)
          }
        })

      const getPaginatedProposals = (input: {
        page: number
        pageSize: number
        sortOrder?: 'asc' | 'desc'
      }) =>
        Effect.gen(function* () {
          const { proposalCount, proposalsKvs } = yield* getGovernanceState()

          const sortOrder = input.sortOrder ?? 'desc'

          // Calculate which IDs to fetch based on sort order
          let startId: number
          let endId: number
          let ids: number[]

          if (sortOrder === 'desc') {
            // Newest first (highest ID first)
            startId = proposalCount - 1 - (input.page - 1) * input.pageSize
            endId = Math.max(startId - input.pageSize + 1, 0)

            if (startId < 0) {
              return {
                items: [],
                totalCount: proposalCount,
                page: input.page,
                pageSize: input.pageSize,
                totalPages: Math.ceil(proposalCount / input.pageSize)
              }
            }

            ids = A.makeBy(startId - endId + 1, (i) => startId - i)
          } else {
            // Oldest first (lowest ID first)
            startId = (input.page - 1) * input.pageSize
            endId = Math.min(startId + input.pageSize - 1, proposalCount - 1)

            if (startId >= proposalCount) {
              return {
                items: [],
                totalCount: proposalCount,
                page: input.page,
                pageSize: input.pageSize,
                totalPages: Math.ceil(proposalCount / input.pageSize)
              }
            }

            ids = A.makeBy(endId - startId + 1, (i) => startId + i)
          }

          const keys = ids.map((id) => ({
            key_json: { kind: 'U64' as const, value: id.toString() }
          }))

          const items = yield* keyValueStoreDataService({
            key_value_store_address: proposalsKvs,
            keys
          }).pipe(
            Effect.map((result) =>
              pipe(
                result,
                A.head,
                Option.map((item) => item.entries),
                Option.getOrElse(() => [])
              )
            ),
            Effect.flatMap((entries) =>
              Effect.all(
                entries.map((entry, index) =>
                  pipe(
                    Option.fromNullable(entry.value.programmatic_json),
                    Option.match({
                      onNone: () => Effect.succeed(Option.none()),
                      onSome: (sbor) =>
                        parseSbor(sbor, ProposalKeyValueStoreValue).pipe(
                          Effect.flatMap((parsed) =>
                            Schema.decodeUnknown(ProposalSchema)({
                              ...parsed,
                              id: ids[index]
                            })
                          ),
                          Effect.map(Option.some)
                        )
                    })
                  )
                ),
                { concurrency: 'unbounded' }
              )
            ),
            Effect.map(A.filterMap((x) => x))
          )

          return {
            items,
            totalCount: proposalCount,
            page: input.page,
            pageSize: input.pageSize,
            totalPages: Math.ceil(proposalCount / input.pageSize)
          }
        })

      const makeProposalManifest = (input: {
        accountAddress: AccountAddress
        temperatureCheckId: TemperatureCheckId
      }) =>
        Effect.gen(function* () {
          const adminBadgeProof = yield* makeAdminBadgeProof(
            input.accountAddress
          )

          return TransactionManifestString.make(`
${adminBadgeProof}
CALL_METHOD
  Address("${config.componentAddress}")
  "make_proposal"
  ${input.temperatureCheckId}u64
;
          `)
        })

      const getProposalVotesByAccounts = (input: {
        keyValueStoreAddress: KeyValueStoreAddress
        accounts: AccountAddress[]
      }) =>
        Effect.gen(function* () {
          const AccountAddressSchema = Schema.Struct({ value: AccountAddress })

          return yield* keyValueStoreDataService({
            key_value_store_address: input.keyValueStoreAddress,
            keys: input.accounts.map((address) => ({
              key_json: { kind: 'Reference' as const, value: address }
            }))
          }).pipe(
            Effect.map((result) =>
              pipe(
                result,
                A.head,
                Option.map((item) => item.entries),
                Option.getOrElse(() =>
                  A.empty<StateKeyValueStoreDataResponseItem>()
                )
              )
            ),
            Effect.flatMap(
              Effect.forEach(
                Effect.fnUntraced(function* (item) {
                  const address = yield* Schema.decodeUnknown(
                    AccountAddressSchema
                  )(item.key.programmatic_json).pipe(
                    Effect.map((result) => result.value)
                  )

                  const options = yield* Schema.decodeUnknown(
                    ProposalVoteValueSchema
                  )(item.value.programmatic_json)

                  return {
                    address,
                    options
                  }
                })
              )
            )
          )
        })

      const makeAddGovernanceParameterSetManifest = (
        input: MakeAddGovernanceParameterSetInput
      ) =>
        Effect.gen(function* () {
          const parsedInput = yield* Schema.decodeUnknown(
            MakeAddGovernanceParameterSetInputSchema
          )(input)
          const adminBadgeProof = yield* makeAdminBadgeProof(
            parsedInput.accountAddress
          )
          const parameterSetInput =
            renderGovernanceParameterSetInput(parsedInput)

          return TransactionManifestString.make(`
${adminBadgeProof}
CALL_METHOD
  Address(${encodeManifestString(config.componentAddress)})
  "add_governance_parameter_set"
  ${encodeManifestString(parsedInput.parameterSetId)}
  ${parameterSetInput}
;
          `)
        })

      const makeUpdateGovernanceParameterSetManifest = (
        input: MakeUpdateGovernanceParameterSetInput
      ) =>
        Effect.gen(function* () {
          const parsedInput = yield* Schema.decodeUnknown(
            MakeUpdateGovernanceParameterSetInputSchema
          )(input)
          const adminBadgeProof = yield* makeAdminBadgeProof(
            parsedInput.accountAddress
          )
          const parameterSetInput =
            renderGovernanceParameterSetInput(parsedInput)

          return TransactionManifestString.make(`
${adminBadgeProof}
CALL_METHOD
  Address(${encodeManifestString(config.componentAddress)})
  "update_governance_parameter_set"
  ${encodeManifestString(parsedInput.parameterSetId)}
  ${parameterSetInput}
;
          `)
        })

      const makeRetireGovernanceParameterSetManifest = (
        input: MakeRetireGovernanceParameterSetInput
      ) =>
        Effect.gen(function* () {
          const parsedInput = yield* Schema.decodeUnknown(
            MakeRetireGovernanceParameterSetInputSchema
          )(input)
          const adminBadgeProof = yield* makeAdminBadgeProof(
            parsedInput.accountAddress
          )

          return TransactionManifestString.make(`
${adminBadgeProof}
CALL_METHOD
  Address(${encodeManifestString(config.componentAddress)})
  "retire_governance_parameter_set"
  ${encodeManifestString(parsedInput.parameterSetId)}
;
          `)
        })

      const makeProposalVoteManifest = (input: MakeProposalVoteInput) =>
        Effect.gen(function* () {
          const parsedInput = yield* Schema.decodeUnknown(
            MakeProposalVoteInputSchema
          )(input)

          const optionIds = parsedInput.optionIds
            .map((id) => `Tuple(${id}u32)`)
            .join(', ')

          return TransactionManifestString.make(`
CALL_METHOD
  Address("${config.componentAddress}")
  "vote_on_proposal"
  Address("${parsedInput.accountAddress}")
  ${parsedInput.proposalId}u64
  Array<Tuple>(${optionIds})
;
CALL_METHOD
  Address("${parsedInput.accountAddress}")
  "deposit_batch"
  Expression("ENTIRE_WORKTOP")
;
          `)
        })

      const makeToggleTemperatureCheckHiddenManifest = (input: {
        accountAddress: AccountAddress
        temperatureCheckId: TemperatureCheckId
      }) =>
        Effect.gen(function* () {
          const adminBadgeProof = yield* makeAdminBadgeProof(
            input.accountAddress
          )

          return TransactionManifestString.make(`
${adminBadgeProof}
CALL_METHOD
  Address("${config.componentAddress}")
  "toggle_temperature_check_hidden"
  ${input.temperatureCheckId}u64
;
          `)
        })

      const makeToggleProposalHiddenManifest = (input: {
        accountAddress: AccountAddress
        proposalId: ProposalId
      }) =>
        Effect.gen(function* () {
          const adminBadgeProof = yield* makeAdminBadgeProof(
            input.accountAddress
          )

          return TransactionManifestString.make(`
${adminBadgeProof}
CALL_METHOD
  Address("${config.componentAddress}")
  "toggle_proposal_hidden"
  ${input.proposalId}u64
;
          `)
        })

      const makeMajorityJudgmentElectionManifest = (
        input: MakeMajorityJudgmentElectionInput
      ) =>
        Effect.gen(function* () {
          const parsedInput = yield* Schema.decodeUnknown(
            MakeMajorityJudgmentElectionInputSchema
          )(input)
          const adminBadgeProof = yield* makeAdminBadgeProof(
            parsedInput.accountAddress
          )
          const draft = renderTemperatureCheckDraft({
            title: parsedInput.title,
            shortDescription: parsedInput.shortDescription,
            description: parsedInput.description,
            links: parsedInput.links,
            followUp: {
              _tag: 'MajorityJudgmentElection',
              roleId: parsedInput.roleId,
              seatCount: parsedInput.seatCount,
              candidates: parsedInput.candidates
            }
          })

          return TransactionManifestString.make(`
${adminBadgeProof}
CALL_METHOD
  Address(${encodeManifestString(config.componentAddress)})
  "make_majority_judgment_election"
  Address(${encodeManifestString(parsedInput.accountAddress)})
  ${draft}
  ${encodeManifestString(parsedInput.parameterSetId)}
  ${renderInstant(parsedInput.tcVotingStart)}
  ${renderInstant(parsedInput.tcVotingEnd)}
  ${renderInstant(parsedInput.votingStart)}
  ${renderInstant(parsedInput.votingEnd)}
  ${renderCandidateOrder(parsedInput.candidateOrder)}
;
          `)
        })

      const recordTemperatureCheckOutcomeManifest = (
        input: RecordTemperatureCheckOutcomeInput
      ) =>
        Effect.gen(function* () {
          const parsedInput = yield* Schema.decodeUnknown(
            RecordTemperatureCheckOutcomeInputSchema
          )(input)
          const adminBadgeProof = yield* makeAdminBadgeProof(
            parsedInput.accountAddress
          )

          return TransactionManifestString.make(`
${adminBadgeProof}
CALL_METHOD
  Address(${encodeManifestString(config.componentAddress)})
  "record_temperature_check_outcome"
  ${parsedInput.temperatureCheckId}u64
  ${parsedInput.passed}
;
          `)
        })

      const makeMajorityJudgmentVoteManifest = (
        input: MakeMajorityJudgmentVoteInput
      ) =>
        Effect.gen(function* () {
          const parsedInput = yield* Schema.decodeUnknown(
            MakeMajorityJudgmentVoteInputSchema
          )(input)
          const round =
            parsedInput.round === 'RoundOne' ? 'Enum<0u8>()' : 'Enum<1u8>()'

          return TransactionManifestString.make(`
CALL_METHOD
  Address(${encodeManifestString(config.componentAddress)})
  "vote_on_majority_judgment_election"
  Address(${encodeManifestString(parsedInput.accountAddress)})
  ${parsedInput.electionId}u64
  ${round}
  ${renderCandidateGrades(parsedInput.grades)}
;
CALL_METHOD
  Address(${encodeManifestString(parsedInput.accountAddress)})
  "deposit_batch"
  Expression("ENTIRE_WORKTOP")
;
          `)
        })

      const startMajorityJudgmentRerunManifest = (
        input: StartMajorityJudgmentRerunInput
      ) =>
        Effect.gen(function* () {
          const parsedInput = yield* Schema.decodeUnknown(
            StartMajorityJudgmentRerunInputSchema
          )(input)
          const adminBadgeProof = yield* makeAdminBadgeProof(
            parsedInput.accountAddress
          )

          return TransactionManifestString.make(`
${adminBadgeProof}
CALL_METHOD
  Address(${encodeManifestString(config.componentAddress)})
  "start_majority_judgment_rerun"
  ${parsedInput.electionId}u64
  ${renderInstant(parsedInput.votingStart)}
;
          `)
        })

      const recordMajorityJudgmentTieResolutionManifest = (
        input: MakeMajorityJudgmentTieResolutionInput
      ) =>
        Effect.gen(function* () {
          const parsedInput = yield* Schema.decodeUnknown(
            MakeMajorityJudgmentTieResolutionInputSchema
          )(input)
          const adminBadgeProof = yield* makeAdminBadgeProof(
            parsedInput.accountAddress
          )
          const round =
            parsedInput.round === 'RoundOne' ? 'Enum<0u8>()' : 'Enum<1u8>()'

          return TransactionManifestString.make(`
${adminBadgeProof}
CALL_METHOD
  Address(${encodeManifestString(config.componentAddress)})
  "record_majority_judgment_tie_resolution"
  ${parsedInput.electionId}u64
  ${round}
  ${renderCandidateOrder(parsedInput.orderedCandidateIds)}
;
          `)
        })

      const makeToggleMajorityJudgmentElectionHiddenManifest = (
        input: ToggleMajorityJudgmentElectionHiddenInput
      ) =>
        Effect.gen(function* () {
          const parsedInput = yield* Schema.decodeUnknown(
            ToggleMajorityJudgmentElectionHiddenInputSchema
          )(input)
          const adminBadgeProof = yield* makeAdminBadgeProof(
            parsedInput.accountAddress
          )

          return TransactionManifestString.make(`
${adminBadgeProof}
CALL_METHOD
  Address(${encodeManifestString(config.componentAddress)})
  "toggle_majority_judgment_election_hidden"
  ${parsedInput.electionId}u64
;
          `)
        })

      return {
        getTemperatureChecks,
        getAllTemperatureChecksVotes,
        makeTemperatureCheckManifest,
        getTemperatureCheckById,
        makeTemperatureCheckVoteManifest,
        getTemperatureCheckVotesByAccounts,
        getGovernanceState,
        getGovernanceParameterSets,
        makeAddGovernanceParameterSetManifest,
        makeUpdateGovernanceParameterSetManifest,
        makeRetireGovernanceParameterSetManifest,
        getProposalById,
        getPaginatedTemperatureChecks,
        getPaginatedProposals,
        makeProposalManifest,
        getTemperatureCheckVotesByIndex,
        getProposalVotesByIndex,
        getProposalVotesByAccounts,
        makeProposalVoteManifest,
        makeToggleTemperatureCheckHiddenManifest,
        makeToggleProposalHiddenManifest,
        getMajorityJudgmentElections,
        getMajorityJudgmentElectionById,
        getMajorityJudgmentVotesByIndex,
        getMajorityJudgmentVoterEntriesByAccounts,
        makeMajorityJudgmentElectionManifest,
        recordTemperatureCheckOutcomeManifest,
        makeMajorityJudgmentVoteManifest,
        startMajorityJudgmentRerunManifest,
        recordMajorityJudgmentTieResolutionManifest,
        makeToggleMajorityJudgmentElectionHiddenManifest
      }
    })
  }
) {}
