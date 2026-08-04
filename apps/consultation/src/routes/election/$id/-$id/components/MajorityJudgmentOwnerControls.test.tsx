// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, assert, describe, it, vi } from 'vitest'
import { formatGovernanceDuration } from '@/lib/governanceDuration'
import type { Candidate } from './CandidateCard'
import { MajorityJudgmentOwnerControls } from './MajorityJudgmentOwnerControls'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const candidate = (
  id: number,
  reference: string,
  displayName: string
): Candidate => ({
  id,
  reference,
  displayName,
  description: '',
  links: []
})

describe('majority judgment owner controls', () => {
  it('offers a rerun only after Round 1 failed quorum', () => {
    const onStartRerun = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <MajorityJudgmentOwnerControls
        status="ROUND_1_FAILED"
        round="RoundOne"
        candidates={[]}
        unresolvedCandidateIds={[]}
        roundDurations={{ votingDays: 3, rerunVotingDays: 2 }}
        busy={false}
        onOpenRoundOne={vi.fn()}
        onStartRerun={onStartRerun}
        onRecordTieResolution={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open Round 2 rerun' }))

    assert.strictEqual(onStartRerun.mock.calls.length, 1)
    assert.include(
      vi.mocked(window.confirm).mock.calls[0]?.[0] as string,
      formatGovernanceDuration(2)
    )
    assert.isNull(
      screen.queryByRole('button', { name: 'Record tie resolution' })
    )
  })

  it('shows the unresolved group and records an explicit order', () => {
    const onRecordTieResolution = vi.fn()

    render(
      <MajorityJudgmentOwnerControls
        status="TIE_UNRESOLVED"
        round="Rerun"
        candidates={[
          candidate(4, 'alice', 'Alice Smith'),
          candidate(2, 'bob', 'Bob Jones')
        ]}
        unresolvedCandidateIds={[4, 2]}
        busy={false}
        onOpenRoundOne={vi.fn()}
        onStartRerun={vi.fn()}
        onRecordTieResolution={onRecordTieResolution}
      />
    )

    assert.isNotNull(screen.getByText('Alice Smith'))
    assert.isNotNull(screen.getByText('alice'))
    assert.isNotNull(screen.getByText('Bob Jones'))
    assert.isNotNull(screen.getByText('bob'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Record tie resolution' })
    )

    assert.deepStrictEqual(onRecordTieResolution.mock.calls[0], [[4, 2]])
  })

  it('loads an unresolved tie group that arrives after the view mounts', () => {
    const onRecordTieResolution = vi.fn()
    const callbacks = {
      busy: false,
      onOpenRoundOne: vi.fn(),
      onStartRerun: vi.fn(),
      onRecordTieResolution
    }
    const candidates = [
      candidate(7, 'carol', 'Carol Diaz'),
      candidate(3, 'dave', 'Dave Lee')
    ]
    const view = render(
      <MajorityJudgmentOwnerControls
        {...callbacks}
        status="LIVE"
        round="RoundOne"
        candidates={candidates}
        unresolvedCandidateIds={[]}
      />
    )

    view.rerender(
      <MajorityJudgmentOwnerControls
        {...callbacks}
        status="TIE_UNRESOLVED"
        round="RoundOne"
        candidates={candidates}
        unresolvedCandidateIds={[7, 3]}
      />
    )

    assert.isNotNull(screen.getByText('Carol Diaz'))
    assert.isNotNull(screen.getByText('Dave Lee'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Record tie resolution' })
    )
    assert.deepStrictEqual(onRecordTieResolution.mock.calls[0], [[7, 3]])
  })

  it('renders Round 1 in MJ_PENDING and dispatches only after confirmation', () => {
    const onOpenRoundOne = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <MajorityJudgmentOwnerControls
        status="MJ_PENDING"
        candidates={[]}
        unresolvedCandidateIds={[]}
        roundDurations={{ votingDays: 3, rerunVotingDays: 2 }}
        busy={false}
        onOpenRoundOne={onOpenRoundOne}
        onStartRerun={vi.fn()}
        onRecordTieResolution={vi.fn()}
      />
    )

    const button = screen.getByRole('button', {
      name: 'Open Round 1 grading'
    })
    fireEvent.click(button)
    assert.strictEqual(onOpenRoundOne.mock.calls.length, 0)
    assert.include(
      confirm.mock.calls[0]?.[0] as string,
      formatGovernanceDuration(3)
    )
    assert.include(confirm.mock.calls[0]?.[0] as string, 'ledger time')

    confirm.mockReturnValue(true)
    fireEvent.click(button)
    assert.strictEqual(onOpenRoundOne.mock.calls.length, 1)
  })

  it('disables round opening while frozen durations are unavailable', () => {
    render(
      <MajorityJudgmentOwnerControls
        status="MJ_PENDING"
        candidates={[]}
        unresolvedCandidateIds={[]}
        busy={false}
        onOpenRoundOne={vi.fn()}
        onStartRerun={vi.fn()}
        onRecordTieResolution={vi.fn()}
      />
    )

    assert.isTrue(
      screen
        .getByRole('button', { name: 'Open Round 1 grading' })
        .hasAttribute('disabled')
    )
  })
})
