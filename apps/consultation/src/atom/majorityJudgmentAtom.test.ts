import { Effect, Layer } from 'effect'
import {
  GovernanceComponent,
  MajorityJudgmentElectionIdSchema,
  TemperatureCheckId
} from 'shared/governance/index'
import { assert, it, vi } from 'vitest'
import { getMajorityJudgmentRoundDurations } from './majorityJudgmentAtom'

it('reads round durations from the election snapshot rather than the current registry', async () => {
  const getGovernanceParameterSets = vi.fn(() =>
    Effect.succeed([{ votingDays: 99, rerunVotingDays: 98 }])
  )
  const governance = {
    getMajorityJudgmentElectionById: () =>
      Effect.succeed({ temperatureCheckId: TemperatureCheckId.make(3) }),
    getTemperatureCheckById: () =>
      Effect.succeed({
        parameterSet: {
          parameters: {
            _tag: 'MajorityJudgment',
            election: { votingDays: 7, rerunVotingDays: 5 }
          }
        }
      }),
    getGovernanceParameterSets
  }

  const durations = await Effect.runPromise(
    getMajorityJudgmentRoundDurations(
      MajorityJudgmentElectionIdSchema.make(7)
    ).pipe(
      Effect.provide(Layer.succeed(GovernanceComponent, governance as never))
    )
  )

  assert.deepStrictEqual(durations, { votingDays: 7, rerunVotingDays: 5 })
  assert.strictEqual(getGovernanceParameterSets.mock.calls.length, 0)
})
