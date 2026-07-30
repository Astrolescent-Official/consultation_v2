import { assert, describe, it } from 'vitest'
import { msPerGovernanceDurationUnit } from '@/lib/governanceDuration'
import {
  ABSTAIN_VOTE_OPTION_LABEL,
  getProposalVoteOptionLabels,
  makeMajorityJudgmentSchedule,
  temperatureCheckFormOpts
} from './formOptions'

const voteOptions = [
  { id: 'for', label: 'For' },
  { id: 'against', label: 'Against' }
]

describe('proposal Abstain option', () => {
  it('is enabled by default', () => {
    assert.isTrue(temperatureCheckFormOpts.defaultValues.includeAbstain)
  })

  it('is appended to single-choice proposals', () => {
    assert.deepEqual(
      getProposalVoteOptionLabels({
        voteOptions,
        maxSelections: 1,
        includeAbstain: true,
        isAdmin: false
      }),
      ['For', 'Against', ABSTAIN_VOTE_OPTION_LABEL]
    )
  })

  it('cannot be omitted by a non-admin account', () => {
    assert.deepEqual(
      getProposalVoteOptionLabels({
        voteOptions,
        maxSelections: 1,
        includeAbstain: false,
        isAdmin: false
      }),
      ['For', 'Against', ABSTAIN_VOTE_OPTION_LABEL]
    )
  })

  it('can be omitted by an admin account', () => {
    assert.deepEqual(
      getProposalVoteOptionLabels({
        voteOptions,
        maxSelections: 1,
        includeAbstain: false,
        isAdmin: true
      }),
      ['For', 'Against']
    )
  })

  it('is omitted from multiple-choice proposals', () => {
    assert.deepEqual(
      getProposalVoteOptionLabels({
        voteOptions,
        maxSelections: 2,
        includeAbstain: true,
        isAdmin: false
      }),
      ['For', 'Against']
    )
  })
})

describe('Majority Judgment schedule defaults', () => {
  it('meets each selected parameter set minimum with a future start', () => {
    const now = new Date(2026, 6, 30, 12, 0, 30)
    const schedule = makeMajorityJudgmentSchedule(
      { temperatureCheckVotingUnits: 5, electionVotingUnits: 10 },
      now
    )

    const tcStart = new Date(schedule.tcVotingStart)
    const tcEnd = new Date(schedule.tcVotingEnd)
    const votingStart = new Date(schedule.votingStart)
    const votingEnd = new Date(schedule.votingEnd)

    assert.isAbove(tcStart.getTime(), now.getTime())
    assert.strictEqual(
      tcEnd.getTime() - tcStart.getTime(),
      5 * msPerGovernanceDurationUnit
    )
    assert.strictEqual(votingStart.getTime(), tcEnd.getTime())
    assert.strictEqual(
      votingEnd.getTime() - votingStart.getTime(),
      10 * msPerGovernanceDurationUnit
    )
  })
})
