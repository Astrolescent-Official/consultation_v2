// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, assert, describe, it } from 'vitest'
import { useAppForm } from '../formHook'
import { temperatureCheckFormOpts } from '../formOptions'
import { VoteOptionsField } from './VoteOptionsField'

afterEach(cleanup)

function VoteOptionsFieldHarness({
  isAdmin,
  isSingleChoice
}: {
  isAdmin: boolean
  isSingleChoice: boolean
}) {
  const form = useAppForm({
    ...temperatureCheckFormOpts
  })

  return (
    <VoteOptionsField
      form={form}
      maxOptions={isSingleChoice ? 9 : 10}
      isSingleChoice={isSingleChoice}
      isAdmin={isAdmin}
    />
  )
}

describe('Abstain vote option control', () => {
  it('shows Abstain selected and locked for non-admin accounts', () => {
    render(<VoteOptionsFieldHarness isAdmin={false} isSingleChoice />)

    const checkbox = screen.getByRole('checkbox', { name: 'Abstain' })
    assert.isTrue(checkbox.hasAttribute('disabled'))
    assert.strictEqual(checkbox.getAttribute('data-state'), 'checked')
  })

  it('lets admin accounts deselect Abstain', () => {
    render(<VoteOptionsFieldHarness isAdmin isSingleChoice />)

    const checkbox = screen.getByRole('checkbox', { name: 'Abstain' })
    assert.isFalse(checkbox.hasAttribute('disabled'))
    fireEvent.click(checkbox)
    assert.strictEqual(checkbox.getAttribute('data-state'), 'unchecked')
  })

  it('does not show Abstain for multiple-choice proposals', () => {
    render(<VoteOptionsFieldHarness isAdmin={false} isSingleChoice={false} />)

    assert.isNull(screen.queryByRole('checkbox', { name: 'Abstain' }))
  })
})
