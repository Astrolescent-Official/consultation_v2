// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, assert, describe, it, vi } from 'vitest'
import { MajorityJudgmentElectionView } from './MajorityJudgmentElectionView'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { readonly children: ReactNode }) => children
}))

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

// The detail layout renders the details column and the sidebar once per
// breakpoint, so anything on the page legitimately appears twice in the DOM.
const first = (matcher: string | RegExp) => screen.getAllByText(matcher)[0]
const absent = (matcher: string | RegExp) =>
  screen.queryAllByText(matcher).length === 0
const gradesPerCandidate = 5
const layoutCopies = 2

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('majority judgment election view', () => {
  it('renders the operator wait without a grading countdown or round quorum', () => {
    render(
      <MajorityJudgmentElectionView
        electionId={7}
        title="RAC election"
        status="MJ_PENDING"
        candidates={candidates}
        seatCount={1}
        tcVotingStart={new Date('2026-07-21T10:00:00.000Z')}
        tcVotingEnd={new Date('2026-07-22T10:00:00.000Z')}
        totalVotingPower="0"
      />
    )

    assert.isNotNull(first('Awaiting the Governance Operator to open grading'))
    assert.isTrue(absent(/grading opens/i))
    assert.isTrue(absent(/Quorum Reached/i))
  })

  it('shows the TC stage, disables grades, and hides MJ tallies', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'))
    render(
      <MajorityJudgmentElectionView
        electionId={7}
        title="RAC election"
        status="TC_LIVE"
        candidates={candidates}
        seatCount={1}
        roleId="rac"
        temperatureCheckId={42}
        parameterSetId="rac-election"
        parameterSetVersion={3}
        tcVotingStart={new Date('2026-07-21T10:00:00.000Z')}
        tcVotingEnd={new Date('2026-07-22T10:00:00.000Z')}
        votingStart={new Date('2026-07-22T10:00:00.000Z')}
        votingEnd={new Date('2026-07-29T10:00:00.000Z')}
        quorumXrd="1000000"
        totalVotingPower="0"
      />
    )

    assert.isNotNull(first('Candidate list review — vote For or Against'))
    assert.strictEqual(
      screen.getAllByRole('radio').length,
      candidates.length * gradesPerCandidate * layoutCopies
    )
    assert.isTrue(
      screen
        .getAllByRole('radio')
        .every((radio) => radio.hasAttribute('disabled'))
    )
    assert.isTrue(absent(/provisional/i))
    assert.isTrue(absent(/majority grade/i))
    assert.isNotNull(first('1 seat · Role rac'))
    assert.isNotNull(first('Candidate-list TC #42'))
    assert.isNotNull(first('rac-election · version 3'))
    assert.isNotNull(first(/TC voting closes/i))
    assert.isTrue(absent(/XRD$/))
    assert.isTrue(absent(/participation/i))
  })

  it('does not describe TC voting as open after its deadline', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-22T10:00:00.000Z'))
    render(
      <MajorityJudgmentElectionView
        electionId={7}
        title="RAC election"
        status="TC_LIVE"
        candidates={candidates}
        seatCount={1}
        tcVotingStart={new Date('2026-07-21T10:00:00.000Z')}
        tcVotingEnd={new Date('2026-07-22T10:00:00.000Z')}
        votingStart={new Date('2026-07-23T10:00:00.000Z')}
        votingEnd={new Date('2026-07-30T10:00:00.000Z')}
        quorumXrd="1000000"
        totalVotingPower="0"
      />
    )

    assert.isNotNull(
      first('Candidate-list voting closed; awaiting the verified outcome')
    )
    assert.isTrue(absent(/TC voting closes/i))
  })

  it('requires one grade per candidate and reports the remaining count', () => {
    render(
      <MajorityJudgmentElectionView
        electionId={7}
        title="RAC election"
        status="LIVE"
        candidates={candidates}
        seatCount={1}
        quorumXrd="1000000"
        totalVotingPower="500000"
      />
    )

    assert.isNotNull(first('2 candidates still need a grade'))
    assert.isTrue(
      screen
        .getAllByRole('button', { name: 'Submit ballot' })
        .every((button) => button.hasAttribute('disabled'))
    )
    assert.isNotNull(first('500.00K / 1.00M XRD'))
  })

  it('records a grade chosen against a candidate on the ballot summary', () => {
    render(
      <MajorityJudgmentElectionView
        electionId={7}
        title="RAC election"
        status="LIVE"
        candidates={candidates}
        seatCount={1}
        quorumXrd="1000000"
        totalVotingPower="500000"
      />
    )

    assert.strictEqual(screen.getAllByText('Not graded').length, 2)
    fireEvent.click(screen.getAllByRole('radio', { name: 'Excellent' })[0])

    assert.strictEqual(screen.getAllByText('Not graded').length, 1)
    assert.isNotNull(first('1 candidate still needs a grade'))
  })

  it('labels live results provisional and discloses the rerun grade floor', () => {
    render(
      <MajorityJudgmentElectionView
        electionId={7}
        title="RAC election"
        status="RERUN_LIVE"
        candidates={candidates}
        seatCount={1}
        quorumXrd="500000"
        totalVotingPower="300000"
        minimumMedianGrade={3}
        result={{
          candidateResults: [],
          unresolvedCandidateIds: []
        }}
      />
    )

    assert.isNotNull(first('Provisional results'))
    assert.isNotNull(first(/rerun/i))
    assert.isNotNull(first(/minimum majority grade: Very Good/i))
  })

  it('publishes the majority-gauge evidence and visible tied rank', () => {
    render(
      <MajorityJudgmentElectionView
        electionId={7}
        title="RAC election"
        status="FINAL"
        candidates={candidates}
        seatCount={1}
        quorumXrd="10"
        totalVotingPower="10"
        minimumMedianGrade={2}
        result={{
          quorumMet: true,
          candidateResults: candidates.map(({ id }) => ({
            candidateId: id,
            histogram: ['1', '0', '5', '0', '4'],
            qualifyingGrade: 2,
            powerAbove: '4',
            powerBelow: '1',
            p: '0.4',
            q: '0.1',
            band: 'A' as const,
            electable: true,
            rank: 2,
            tieGroupId: 1,
            outcome: 'RESERVE' as const
          })),
          unresolvedCandidateIds: []
        }}
      />
    )

    assert.isNotNull(first('Band A · p 0.4 · q 0.1'))
    assert.isNotNull(first(/Above 4 XRD · Below 1 XRD/))
    assert.isNotNull(first('Rank 2 · Tie group 1'))
    assert.isNotNull(first('Tied rank · group 1 · 2 candidates · Reserve list'))
    assert.isNotNull(first(/Equal ranks remain published as ties/))
  })

  it('renders unresolved, failed, and final terminal explanations', () => {
    const statuses = [
      ['TIE_UNRESOLVED', 'Governance tie resolution required'],
      ['ROUND_1_FAILED', 'Turnout below quorum — awaiting a rerun decision'],
      ['FAILED', 'The rerun did not meet quorum'],
      ['FINAL', 'Official result']
    ] as const

    for (const [status, text] of statuses) {
      const view = render(
        <MajorityJudgmentElectionView
          electionId={7}
          title="RAC election"
          status={status}
          candidates={candidates}
          seatCount={1}
          quorumXrd="500000"
          totalVotingPower="300000"
          result={{
            candidateResults: [],
            unresolvedCandidateIds: status === 'TIE_UNRESOLVED' ? [0, 1] : []
          }}
        />
      )
      assert.isNotNull(first(text))
      view.unmount()
    }
  })

  it('prefills a ballot that arrives after the view mounts', () => {
    const onSubmit = vi.fn()
    const baseProps = {
      candidates,
      electionId: 7,
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

    assert.isNotNull(first('This submission will replace your earlier ballot.'))
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Replace ballot' })[0]
    )
    assert.deepStrictEqual(onSubmit.mock.calls[0], [
      [
        { candidateId: 0, grade: 4 },
        { candidateId: 1, grade: 2 }
      ]
    ])
  })

  it('closes ballot controls at the Scrypto deadline even if status is still live', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T09:59:59.000Z'))
    const onSubmit = vi.fn()

    render(
      <MajorityJudgmentElectionView
        electionId={7}
        title="RAC election"
        status="LIVE"
        candidates={candidates}
        seatCount={1}
        votingEnd={new Date('2026-07-29T10:00:00.000Z')}
        quorumXrd="1000000"
        totalVotingPower="500000"
        initialGrades={[
          { candidateId: 0, grade: 4 },
          { candidateId: 1, grade: 2 }
        ]}
        onSubmit={onSubmit}
      />
    )

    assert.isNotEmpty(screen.getAllByRole('button', { name: 'Replace ballot' }))
    act(() => vi.advanceTimersByTime(1_000))

    assert.isTrue(
      screen
        .getAllByRole('radio')
        .every((radio) => radio.hasAttribute('disabled'))
    )
    assert.isTrue(absent('Replace ballot'))
    assert.isNotNull(first('Voting closed; finalizing result'))
    assert.strictEqual(onSubmit.mock.calls.length, 0)
  })
})
