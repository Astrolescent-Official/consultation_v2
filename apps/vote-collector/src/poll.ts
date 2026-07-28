import { GatewayApiClient } from '@radix-effects/gateway'
import { StateVersion } from '@radix-effects/shared'
import { Array as A, Clock, Effect, Option, Order, pipe } from 'effect'
import { GovernanceConfig } from 'shared/governance/config'
import { GovernanceEventProcessor } from './governanceEvents'
import { LedgerCursor } from './ledgerCursor'
import { MajorityJudgmentCalculation } from './majority-judgment/calculation'
import { MajorityJudgmentFinalizer } from './majority-judgment/finalizer'
import { MajorityJudgmentProjection } from './majority-judgment/projection'
import { VoteCalculation } from './vote-calculation/voteCalculation'

const PAGE_SIZE = 100

export class PollService extends Effect.Service<PollService>()('PollService', {
  dependencies: [
    LedgerCursor.Default,
    GovernanceEventProcessor.Default,
    VoteCalculation.Default,
    MajorityJudgmentProjection.Default,
    MajorityJudgmentCalculation.Default,
    MajorityJudgmentFinalizer.Default
  ],
  effect: Effect.gen(function* () {
    const cursor = yield* LedgerCursor
    const gateway = yield* GatewayApiClient
    const { processBatch } = yield* GovernanceEventProcessor
    const calculateVotes = yield* VoteCalculation
    const projectMajorityJudgment = yield* MajorityJudgmentProjection
    const calculateMajorityJudgment = yield* MajorityJudgmentCalculation
    const majorityJudgmentFinalizer = yield* MajorityJudgmentFinalizer
    const config = yield* GovernanceConfig

    const fetchPage = (stateVersion: StateVersion) =>
      gateway.stream.innerClient
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
        .pipe(Effect.orDie)

    const processPage = (stateVersion: StateVersion) =>
      Effect.gen(function* () {
        const result = yield* fetchPage(stateVersion)

        if (A.isEmptyArray(result.items)) {
          yield* Effect.log('No transactions to process, poll complete')
          return { stateVersion, drained: true }
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
          drained: result.items.length < PAGE_SIZE
        }
      })

    return Effect.fn('@VoteCollector/PollService')(function* () {
      const sv = yield* cursor.getOrBootstrap()

      yield* Effect.log('Poll started', { fromStateVersion: sv })

      yield* Effect.iterate(
        { stateVersion: sv, drained: false },
        {
          while: (s) => !s.drained,
          body: (s) => processPage(s.stateVersion)
        }
      )

      const now = new Date(yield* Clock.currentTimeMillis)
      yield* majorityJudgmentFinalizer.finalize(now)
    })
  })
}) {}
