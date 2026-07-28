// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, assert, describe, it, vi } from 'vitest'
import { MajorityJudgmentElectionView } from './MajorityJudgmentElectionView'

const candidates = [
  {
    id: 0,
    displayName: 'Alice',
    description: 'Alice profile',
    links: []
  },
  {
    id: 1,
    displayName: 'Bob',
    description: 'Bob profile',
    links: []
  }
]

afterEach(cleanup)

describe('majority judgment election view', () => {
  it('shows candidate review, disables grades, and hides tallies', () => {
    render(
      <MajorityJudgmentElectionView
        title="RAC election"
        status="REVIEW_OPEN"
        candidates={candidates}
        seatCount={1}
        roleId="rac"
        temperatureCheckId={42}
        parameterSetId="rac-election"
        parameterSetVersion={3}
        reviewStart={new Date('2026-07-21T10:00:00.000Z')}
        reviewEnd={new Date('2026-07-22T10:00:00.000Z')}
        votingStart={new Date('2026-07-22T10:00:00.000Z')}
        votingEnd={new Date('2026-07-29T10:00:00.000Z')}
        quorumXrd="1000000"
        totalVotingPower="0"
      />
    )

    assert.isNotNull(screen.getByText('Candidate review'))
    assert.strictEqual(screen.getAllByRole('radio').length, 10)
    assert.isTrue(
      screen
        .getAllByRole('radio')
        .every((radio) => radio.hasAttribute('disabled'))
    )
    assert.isNull(screen.queryByText(/provisional/i))
    assert.isNull(screen.queryByText(/majority grade/i))
    assert.isNotNull(screen.getByText('Role rac'))
    assert.isNotNull(screen.getByText('TC #42'))
    assert.isNotNull(screen.getByText('rac-election v3'))
    assert.isNotNull(screen.getByText(/voting opens/i))
    assert.isNull(screen.queryByText(/XRD$/))
    assert.isNull(screen.queryByText(/participation/i))
  })

  it('requires one grade per candidate and reports the remaining count', () => {
    render(
      <MajorityJudgmentElectionView
        title="RAC election"
        status="LIVE"
        candidates={candidates}
        seatCount={1}
        quorumXrd="1000000"
        totalVotingPower="500000"
      />
    )

    assert.isNotNull(screen.getByText('2 candidates still need a grade'))
    assert.isTrue(
      screen
        .getByRole('button', { name: 'Submit ballot' })
        .hasAttribute('disabled')
    )
    assert.isNotNull(screen.getByText('500000 / 1000000 XRD'))
  })

  it('labels live results provisional and discloses reruns and raised grades', () => {
    render(
      <MajorityJudgmentElectionView
        title="RAC election"
        status="RERUN_LIVE"
        candidates={candidates}
        seatCount={1}
        quorumXrd="500000"
        totalVotingPower="300000"
        minimumMedianGrade={3}
        result={{
          candidateResults: [],
          tieBreakIterations: 2,
          unresolvedCandidateIds: []
        }}
      />
    )

    assert.isNotNull(screen.getByText('Provisional results'))
    assert.isNotNull(screen.getByText(/rerun/i))
    assert.isNotNull(screen.getByText(/minimum majority grade: Very Good/i))
  })

  it('renders unresolved, failed, and final terminal explanations', () => {
    const statuses = [
      ['TIE_UNRESOLVED', 'Governance tie resolution required'],
      ['FAILED', 'The rerun did not meet quorum'],
      ['FINAL', 'Official result']
    ] as const

    for (const [status, text] of statuses) {
      const view = render(
        <MajorityJudgmentElectionView
          title="RAC election"
          status={status}
          candidates={candidates}
          seatCount={1}
          quorumXrd="500000"
          totalVotingPower="300000"
          result={{
            candidateResults: [],
            tieBreakIterations: 0,
            unresolvedCandidateIds: status === 'TIE_UNRESOLVED' ? [0, 1] : []
          }}
        />
      )
      assert.isNotNull(screen.getByText(text))
      view.unmount()
    }
  })

  it('prefills a ballot that arrives after the view mounts', () => {
    const onSubmit = vi.fn()
    const baseProps = {
      candidates,
      onSubmit,
      quorumXrd: '1000000',
      seatCount: 1,
      status: 'LIVE' as const,
      title: 'RAC election',
      totalVotingPower: '500000'
    }
    const view = render(
      <MajorityJudgmentElectionView {...baseProps} initialGrades={[]} />
    )

    view.rerender(
      <MajorityJudgmentElectionView
        {...baseProps}
        initialGrades={[
          { candidateId: 0, grade: 4 },
          { candidateId: 1, grade: 2 }
        ]}
      />
    )

    assert.isNotNull(
      screen.getByText('This submission will replace your earlier ballot.')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Replace ballot' }))
    assert.deepStrictEqual(onSubmit.mock.calls[0], [
      [
        { candidateId: 0, grade: 4 },
        { candidateId: 1, grade: 2 }
      ]
    ])
  })
})
