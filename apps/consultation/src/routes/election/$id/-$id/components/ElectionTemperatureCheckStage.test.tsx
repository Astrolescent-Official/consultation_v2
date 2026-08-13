// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { MajorityJudgmentElectionIdSchema } from 'shared/governance/index'
import { afterEach, assert, describe, it, vi } from 'vitest'
import { ElectionTemperatureCheckStage } from './ElectionTemperatureCheckStage'

vi.mock('@/hooks/useIsAdmin', () => ({ useIsAdmin: () => true }))
vi.mock('@/components/detail/AccountVotesSection', () => ({
  AccountVotesSection: () => <div>account votes</div>
}))
vi.mock('@/components/detail/VoteResultsSection', () => ({
  VoteResultsSection: () => <div>vote results</div>
}))
vi.mock(
  '@/routes/tc/$id/-$id/components/TemperatureCheckOutcomeControls',
  () => ({ TemperatureCheckOutcomeControls: () => <div>record controls</div> })
)
vi.mock('./ElectionTemperatureCheckBallot', () => ({
  ElectionTemperatureCheckBallot: () => <div>TC ballot</div>
}))

afterEach(cleanup)

describe('election temperature-check stage', () => {
  it('hides sentinel tallies and irreversible controls until parameters are projected', () => {
    render(
      <ElectionTemperatureCheckStage
        temperatureCheckId={3}
        electionId={MajorityJudgmentElectionIdSchema.make(7)}
        status="TC_LIVE"
        tcVotingEnd={new Date('2026-07-08T00:00:00.000Z')}
        tcOutcome="PENDING"
        tcOutcomeRecordedAt={null}
        result={{
          tcParametersProjected: false,
          cacheAvailable: true,
          forVotingPower: '60',
          againstVotingPower: '40',
          participationXrd: '100',
          quorumXrd: '1000000000000000000000000000000',
          quorumMet: false,
          approvalThreshold: '0.5',
          forShare: '0.6',
          approvalMet: true,
          passed: null
        }}
      />
    )

    assert.isNotNull(screen.getByText(/awaiting ledger projection/i))
    assert.isNull(screen.queryByText(/1000000000000000000000000000000/))
    assert.isNull(screen.queryByText('record controls'))
    assert.isNull(screen.queryByText('vote results'))
    assert.isNull(screen.queryByText('account votes'))
  })
})
