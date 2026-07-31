// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, assert, describe, it } from 'vitest'
import { SubmissionErrorSummary } from './SubmissionErrorSummary'

afterEach(cleanup)

describe('submission error summary', () => {
  it('explains why election creation did not start', () => {
    render(
      <SubmissionErrorSummary
        subject="Election"
        errors={[
          { message: 'Candidate reference is required' },
          { message: 'TC voting must start in the future' }
        ]}
      />
    )

    assert.isNotNull(
      screen.getByText(
        'Election was not created. Fix the following details and try again:'
      )
    )
    assert.isNotNull(screen.getByRole('alert'))
    assert.isNotNull(screen.getByText('Candidate reference is required'))
    assert.isNotNull(screen.getByText('TC voting must start in the future'))
  })

  it('renders nothing before a failed submission', () => {
    const { container } = render(
      <SubmissionErrorSummary subject="Election" errors={[]} />
    )

    assert.strictEqual(container.textContent, '')
  })
})
