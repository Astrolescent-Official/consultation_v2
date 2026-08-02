import { assert, describe, it } from 'vitest'
import {
  ABSTAIN_VOTE_OPTION_LABEL,
  getProposalVoteOptionLabels,
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
