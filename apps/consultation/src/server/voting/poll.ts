import { GatewayApiClient } from '@radix-effects/gateway'
import { StateVersion } from '@radix-effects/shared'
import {
  Array as A,
  Duration,
  Effect,
  Option,
  Order,
  pipe,
  Schedule,
  Schema
} from 'effect'
import { EntityId } from 'shared/governance/brandedTypes'
import { GovernanceConfig } from 'shared/governance/config'
import { GovernanceComponent } from 'shared/governance/index'
import { GovernanceEventProcessor } from './governanceEvents'
import { LedgerCursor } from './ledgerCursor'
import { MajorityJudgmentCalculation } from './majority-judgment/calculation'
import {
  MajorityJudgmentFinalizer,
  type MajorityJudgmentLedgerWatermark
} from './majority-judgment/finalizer'
import { MajorityJudgmentProjection } from './majority-judgment/projection'
import { VoteCalculation } from './vote-calculation/voteCalculation'
import { VoteCalculationRepo } from './vote-calculation/voteCalculationRepo'

const PAGE_SIZE = 100
const COMPONENT_CACHE_BACKFILL_BATCH_SIZE = 5

const LedgerDrainStateSchema = Schema.Struct({
  state_version: Schema.Number,
  proposer_round_timestamp: Schema.Date
})

export const decodeLedgerDrainWatermark = Effect.fn(
  'PollService.decodeLedgerDrainWatermark'
)(function* (input: unknown) {
  const ledgerState = yield* Schema.decodeUnknown(LedgerDrainStateSchema)(input)
  return {
    stateVersion: ledgerState.state_version,
    proposerRoundTimestamp: ledgerState.proposer_round_timestamp
  } satisfies MajorityJudgmentLedgerWatermark
})

export class PollService extends Effect.Service<PollService>()('PollService', {
  dependencies: [
    LedgerCursor.Default,
    GovernanceComponent.Default,
    GovernanceEventProcessor.Default,
    VoteCalculation.Default,
    VoteCalculationRepo.Default,
    MajorityJudgmentProjection.Default,
    MajorityJudgmentCalculation.Default,
    MajorityJudgmentFinalizer.Default
  ],
  effect: Effect.gen(function* () {
    const cursor = yield* LedgerCursor
    const gateway = yield* GatewayApiClient
    const governance = yield* GovernanceComponent
    const { processBatch } = yield* GovernanceEventProcessor
    const calculateVotes = yield* VoteCalculation
    const voteCalculationRepo = yield* VoteCalculationRepo
    const projectMajorityJudgment = yield* MajorityJudgmentProjection
    const calculateMajorityJudgment = yield* MajorityJudgmentCalculation
    const majorityJudgmentFinalizer = yield* MajorityJudgmentFinalizer
    const config = yield* GovernanceConfig
    const gatewayRetry = Schedule.exponential(Duration.millis(250)).pipe(
      Schedule.jittered,
      Schedule.intersect(Schedule.recurs(3))
    )

    const fetchPage = (stateVersion: StateVersion) => {
      let retryCount = 0
      return gateway.stream.innerClient
        .streamTransactions({
          streamTransactionsRequest: {
            limit_per_page: PAGE_SIZE,
            from_ledger_state: { state_version: stateVersion },
            order: 'Asc',
            kind_filter: 'User',
            opt_ins: {
              affected_global_entities: true,
              detailed_events: true
            },
            affected_global_entities_filter: [config.componentAddress]
          }
        })
        .pipe(
          Effect.tapError((error) =>
            Effect.logWarning('Gateway page fetch failed', {
              fromStateVersion: stateVersion,
              retryCount: ++retryCount,
              cause: String(error)
            })
          ),
          Effect.retry(gatewayRetry),
          Effect.orDie
        )
    }

    const processPage = (stateVersion: StateVersion) =>
      Effect.gen(function* () {
        const result = yield* fetchPage(stateVersion)
        const watermark = yield* decodeLedgerDrainWatermark(result.ledger_state)

        if (A.isEmptyArray(result.items)) {
          yield* Effect.log('No transactions to process, poll complete')
          return { stateVersion, drained: true, watermark }
        }

        const sorted = A.sortWith(
          result.items,
          (tx) => tx.state_version,
          Order.number
        )
        const maxSv = pipe(
          sorted,
          A.last,
          Option.map((tx) => StateVersion.make(tx.state_version)),
          Option.getOrThrow
        )

        yield* Effect.log('Processing transaction batch', {
          count: sorted.length,
          fromSv: stateVersion,
          toSv: maxSv
        })

        const actions = yield* processBatch(sorted)

        if (A.isNonEmptyArray(actions)) {
          yield* Effect.log('Processing governance actions', {
            actions: actions.length
          })

          yield* Effect.forEach(
            actions,
            Effect.fn('PollService.processGovernanceAction')(
              function* (action) {
                switch (action._tag) {
                  case 'StandardEntityCreated':
                    yield* voteCalculationRepo.initializeComponentCache([
                      {
                        type: action.type,
                        entityId: action.entityId,
                        voteCount: 0
                      }
                    ])
                    break
                  case 'StandardVotesChanged':
                    yield* calculateVotes(action.payload)
                    break
                  case 'MajorityJudgmentCreated':
                  case 'MajorityJudgmentRerunStarted':
                  case 'MajorityJudgmentVisibilityChanged':
                    yield* projectMajorityJudgment(
                      action.electionId,
                      action.observedAt,
                      action.stateVersion
                    )
                    break
                  case 'MajorityJudgmentVotesChanged':
                    yield* projectMajorityJudgment(
                      action.electionId,
                      action.observedAt,
                      action.stateVersion
                    )
                    yield* calculateMajorityJudgment(action)
                    break
                  case 'MajorityJudgmentTieResolutionRecorded':
                    yield* projectMajorityJudgment(
                      action.electionId,
                      action.observedAt,
                      action.stateVersion
                    )
                    yield* majorityJudgmentFinalizer.resolveTie({
                      electionId: action.electionId,
                      round: action.round,
                      orderedCandidateIds: action.orderedCandidateIds,
                      recordedAt: action.observedAt
                    })
                    break
                }
              }
            ),
            { concurrency: 1 }
          )
        }

        const nextSv = StateVersion.make(maxSv + 1)
        yield* cursor.advance(nextSv)

        return {
          stateVersion: nextSv,
          drained: result.items.length < PAGE_SIZE,
          watermark
        }
      })

    const backfillComponentCache = Effect.fn(
      '@Consultation/PollService.backfillComponentCache'
    )(function* () {
      const progress =
        yield* voteCalculationRepo.getComponentCacheBackfillProgress()
      if (progress === null) return

      const [temperatureChecks, proposalPage] = yield* Effect.all(
        [
          governance.getTemperatureChecks(),
          governance.getPaginatedProposals({
            page: 1,
            pageSize: 10_000,
            sortOrder: 'asc'
          })
        ],
        { concurrency: 2 }
      )
      const proposals = proposalPage.items
      const payloads = [
        ...temperatureChecks.map((temperatureCheck) => ({
          type: 'temperature_check' as const,
          entityId: EntityId.make(temperatureCheck.id),
          keyValueStoreAddress: temperatureCheck.votes,
          voteCount: temperatureCheck.voteCount,
          start: temperatureCheck.snapshot.getTime()
        })),
        ...proposals.map((proposal) => ({
          type: 'proposal' as const,
          entityId: EntityId.make(proposal.id),
          keyValueStoreAddress: proposal.votes,
          voteCount: proposal.voteCount,
          start: proposal.start.getTime()
        }))
      ].sort((left, right) => {
        if (left.type === right.type) return left.entityId - right.entityId
        return left.type === 'temperature_check' ? -1 : 1
      })
      const batch = payloads.slice(
        progress,
        progress + COMPONENT_CACHE_BACKFILL_BATCH_SIZE
      )

      if (batch.length === 0) {
        yield* voteCalculationRepo.setComponentCacheBackfillProgress('complete')
        return
      }

      yield* Effect.logInfo('Backfilling component-scoped vote cache', {
        entityCount: payloads.length,
        progress,
        batchSize: batch.length
      })
      // Initialize the whole batch in one D1 statement. Ledger-confirmed
      // zero-vote entities become authoritative immediately; only positive
      // vote counts need the heavier aggregation path.
      yield* voteCalculationRepo.initializeComponentCache(batch)
      yield* Effect.forEach(
        batch.filter((payload) => payload.voteCount > 0),
        calculateVotes,
        { concurrency: 1 }
      )
      const nextProgress = progress + batch.length
      yield* voteCalculationRepo.setComponentCacheBackfillProgress(
        nextProgress >= payloads.length ? 'complete' : nextProgress
      )
    })

    return Effect.fn('@Consultation/PollService')(function* () {
      const sv = yield* cursor.getOrBootstrap()
      const startedAt = Date.now()

      yield* Effect.log('Poll started', { fromStateVersion: sv })

      const drained = yield* Effect.iterate(
        {
          stateVersion: sv,
          drained: false,
          watermark: Option.none<MajorityJudgmentLedgerWatermark>()
        },
        {
          while: (s) => !s.drained,
          body: (s) =>
            processPage(s.stateVersion).pipe(
              Effect.map((page) => ({
                ...page,
                watermark: Option.some(page.watermark)
              }))
            )
        }
      )

      // The stream response's ledger state is the stable point through which
      // this affected-entity query was exhausted. Its proposer timestamp, not
      // collector wall time, proves that every valid pre-deadline vote visible
      // at that ledger point was processed before a terminal result is written.
      // Populate component-scoped vote state before finalization. Progress is
      // keyed by governance component address, so a rotation automatically
      // starts a fresh bounded backfill. A failed batch is retried on the next
      // poll, but it must not prevent unrelated elections from finalizing.
      yield* backfillComponentCache().pipe(
        Effect.catchAllCause((cause) =>
          Effect.logError('Component vote-cache backfill deferred', { cause })
        )
      )
      yield* Option.match(drained.watermark, {
        onNone: () => Effect.void,
        onSome: majorityJudgmentFinalizer.finalize
      })

      yield* Effect.logInfo('Poll completed', {
        fromStateVersion: sv,
        nextStateVersion: drained.stateVersion,
        durationMs: Date.now() - startedAt
      })
    })
  })
}) {}
