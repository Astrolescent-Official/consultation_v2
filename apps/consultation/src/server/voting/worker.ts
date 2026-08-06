import {
  GatewayApiClient,
  GetFungibleBalance,
  GetNonFungibleBalanceService,
  GetValidators
} from '@radix-effects/gateway'
import { AccountAddress, StateVersion } from '@radix-effects/shared'
import BigNumber from 'bignumber.js'
import { Config, Duration, Effect, ParseResult, Schema } from 'effect'
import { GovernanceConfig } from 'shared/governance/config'
import { EntityType } from 'shared/governance/index'
import { runCronEffect, runHttpEffect, type VotingWorkerEnv } from './layers'
import { MajorityJudgmentRepo } from './majority-judgment/repo'
import { PollService } from './poll'
import { PollLock } from './pollLock'
import { buildResourceBalances } from './vote-calculation/resourceBalances'
import { VoteCalculationRepo } from './vote-calculation/voteCalculationRepo'
import { VotePowerSnapshot } from './vote-calculation/votePowerSnapshot'
import { getVotePowerConfig } from './vote-calculation/voteSourceConfig'

const QueryParams = Schema.Struct({
  type: EntityType,
  entityId: Schema.NumberFromString
})

const MajorityJudgmentQueryParams = Schema.Struct({
  electionId: Schema.NumberFromString.pipe(Schema.int(), Schema.nonNegative())
})

const VotingPowerQueryParams = Schema.Struct({
  accountAddress: Schema.String
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

const parseMajorityJudgmentQuery = (request: Request) => {
  const query = Object.fromEntries(new URL(request.url).searchParams)
  return Schema.decodeUnknown(MajorityJudgmentQueryParams)(query, {
    errors: 'all'
  }).pipe(
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

const parseVotingPowerQuery = (request: Request) => {
  const query = Object.fromEntries(new URL(request.url).searchParams)
  return Schema.decodeUnknown(VotingPowerQueryParams)(query, {
    errors: 'all'
  }).pipe(
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

export const handleVotingRequest = (request: Request, env: VotingWorkerEnv) =>
  runHttpEffect(
    env,
    Effect.gen(function* () {
      const pathname = new URL(request.url).pathname

      if (pathname === '/majority-judgment-election') {
        const params = yield* parseMajorityJudgmentQuery(request)
        const repo = yield* MajorityJudgmentRepo
        return json(yield* repo.getElectionResponse(params.electionId))
      }

      if (pathname === '/voting-power') {
        const params = yield* parseVotingPowerQuery(request)
        const gateway = yield* GatewayApiClient
        const getFungibleBalance = yield* GetFungibleBalance
        const getNonFungibleBalance = yield* GetNonFungibleBalanceService
        const getValidators = yield* GetValidators
        const snapshot = yield* VotePowerSnapshot
        const accountAddress = AccountAddress.make(params.accountAddress)
        const current = yield* gateway.status.getCurrent()
        const stateVersion = StateVersion.make(
          current.ledger_state.state_version
        )
        const sourceConfig = getVotePowerConfig(new Date())
        const [result, fungibleBalances, nonFungibleBalances, validators] =
          yield* Effect.all(
            [
              snapshot({
                addresses: [accountAddress],
                stateVersion,
                sourceConfig
              }),
              getFungibleBalance({
                addresses: [accountAddress],
                at_ledger_state: { state_version: stateVersion }
              }),
              getNonFungibleBalance({
                addresses: [String(accountAddress)],
                at_ledger_state: { state_version: stateVersion },
                resourceAddresses: [
                  ...sourceConfig.precisionPoolsV1.map(
                    (pool) => pool.lpResourceAddress
                  ),
                  ...sourceConfig.precisionPoolsV2.map(
                    (pool) => pool.lpResourceAddress
                  ),
                  ...sourceConfig.shapePools.map(
                    (pool) => pool.liquidity_receipt
                  )
                ]
              }),
              getValidators()
            ],
            { concurrency: 'unbounded' }
          )
        const votePower = result.votePower[accountAddress] ?? new BigNumber(0)
        const fungibleAccount = fungibleBalances.find(
          (balance) => balance.address === accountAddress
        )
        const resourceBalances = buildResourceBalances(
          fungibleAccount?.items ?? [],
          nonFungibleBalances.items
        )

        const validatorLsuBalances = validators.flatMap((validator) => {
          const amount = resourceBalances[validator.lsuResourceAddress]

          return amount
            ? [{ resourceAddress: validator.lsuResourceAddress, amount }]
            : []
        })
        const { xrdResourceAddress } = yield* GovernanceConfig

        const response = json({
          votePower: votePower
            .decimalPlaces(0, BigNumber.ROUND_FLOOR)
            .toFixed(),
          resourceBalances,
          validatorLsuBalances,
          xrdResourceAddress: String(xrdResourceAddress)
        })
        response.headers.set('cache-control', 'private, max-age=30')
        return response
      }

      const params = yield* parseQuery(request)
      const repo = yield* VoteCalculationRepo

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
      Effect.catchTag('MajorityJudgmentProjectionNotFoundError', () =>
        Effect.succeed(json({ error: 'Election not found' }, 404))
      ),
      Effect.catchAll((error) =>
        error instanceof Response
          ? Effect.succeed(error)
          : Effect.logError('Vote API request failed', error).pipe(
              Effect.as(json({ error: 'Internal server error' }, 500))
            )
      ),
      Effect.catchAllDefect((defect) =>
        Effect.logError('Unhandled vote API defect', defect).pipe(
          Effect.as(json({ error: 'Internal server error' }, 500))
        )
      )
    )
  )

export const runScheduledPoll = (
  env: VotingWorkerEnv,
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
