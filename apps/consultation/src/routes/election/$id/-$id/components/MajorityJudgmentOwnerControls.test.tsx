// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, assert, describe, it, vi } from 'vitest'
import { MajorityJudgmentOwnerControls } from './MajorityJudgmentOwnerControls'

afterEach(cleanup)

describe('majority judgment owner controls', () => {
  it('offers a scheduled rerun only while one is pending', () => {
    const onStartRerun = vi.fn()

    render(
      <MajorityJudgmentOwnerControls
        status="RERUN_PENDING"
        round="RoundOne"
        hidden={false}
        unresolvedCandidateIds={[]}
        busy={false}
        onStartRerun={onStartRerun}
        onRecordTieResolution={vi.fn()}
        onToggleVisibility={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Rerun voting start'), {
      target: { value: '2026-08-01T12:00' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Schedule rerun' }))

    assert.strictEqual(onStartRerun.mock.calls.length, 1)
    assert.isTrue(onStartRerun.mock.calls[0]?.[0] instanceof Date)
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
        hidden={true}
        unresolvedCandidateIds={[4, 2]}
        busy={false}
        onStartRerun={vi.fn()}
        onRecordTieResolution={onRecordTieResolution}
        onToggleVisibility={vi.fn()}
      />
    )

    assert.isNotNull(screen.getByText('Candidate 4'))
    assert.isNotNull(screen.getByText('Candidate 2'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Record tie resolution' })
    )

    assert.deepStrictEqual(onRecordTieResolution.mock.calls[0], [[4, 2]])
    assert.isNotNull(screen.getByRole('button', { name: 'Show election' }))
  })

  it('loads an unresolved tie group that arrives after the view mounts', () => {
    const onRecordTieResolution = vi.fn()
    const callbacks = {
      busy: false,
      hidden: false,
      onStartRerun: vi.fn(),
      onRecordTieResolution,
      onToggleVisibility: vi.fn()
    }
    const view = render(
      <MajorityJudgmentOwnerControls
        {...callbacks}
        status="LIVE"
        round="RoundOne"
        unresolvedCandidateIds={[]}
      />
    )

    view.rerender(
      <MajorityJudgmentOwnerControls
        {...callbacks}
        status="TIE_UNRESOLVED"
        round="RoundOne"
        unresolvedCandidateIds={[7, 3]}
      />
    )

    assert.isNotNull(screen.getByText('Candidate 7'))
    assert.isNotNull(screen.getByText('Candidate 3'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Record tie resolution' })
    )
    assert.deepStrictEqual(onRecordTieResolution.mock.calls[0], [[7, 3]])
  })
})
