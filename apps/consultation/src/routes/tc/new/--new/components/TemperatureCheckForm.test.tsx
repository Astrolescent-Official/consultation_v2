// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, assert, beforeEach, describe, it, vi } from 'vitest'
import { TemperatureCheckForm } from './TemperatureCheckForm'

const atomMocks = vi.hoisted(() => ({
  createElection: vi.fn(),
  createTemperatureCheck: vi.fn()
}))

vi.mock('@/atom/adminAtom', () => ({
  createMajorityJudgmentElectionAtom: 'create-election'
}))

vi.mock('@/atom/dappToolkitAtom', () => ({
  accountsAtom: 'accounts'
}))

vi.mock('@/atom/governanceParametersAtom', () => ({
  governanceParameterSetsAtom: 'parameter-sets'
}))

vi.mock('@/atom/majorityJudgmentAtom', () => ({
  majorityJudgmentElectionsAtom: 'elections'
}))

vi.mock('@/atom/temperatureChecksAtom', () => ({
  makeTemperatureCheckAtom: 'create-temperature-check'
}))

vi.mock('@/hooks/useIsAdmin', () => ({
  useIsAdmin: () => true
}))

vi.mock('./MarkdownUploadField', () => ({
  MarkdownUploadField: () => null
}))

vi.mock('@effect-atom/atom-react', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@effect-atom/atom-react')>()
  const { Result } = actual

  return {
    ...actual,
    useAtom: (atom: unknown) =>
      atom === 'create-election'
        ? [Result.initial(), atomMocks.createElection]
        : [Result.initial(), atomMocks.createTemperatureCheck],
    useAtomValue: (atom: unknown) => {
      if (atom === 'accounts') return Result.success([{}])
      if (atom === 'elections') return Result.success([])
      if (atom === 'parameter-sets') {
        return Result.success({
          active: [
            {
              id: 'default',
              label: 'Majority Judgment',
              version: 1,
              parameters: {
                _tag: 'MajorityJudgment',
                temperatureCheck: {
                  votingDays: 1,
                  quorum: 1,
                  approvalThreshold: 0.5
                },
                election: { votingDays: 1 }
              }
            }
          ]
        })
      }
      return Result.initial()
    }
  }
})

beforeEach(() => {
  atomMocks.createElection.mockClear()
  atomMocks.createTemperatureCheck.mockClear()
})

afterEach(cleanup)

describe('Create election submission', () => {
  it('shows the validation failure instead of making the button look inert', async () => {
    render(<TemperatureCheckForm />)

    const createButton = await screen.findByRole('button', {
      name: 'Create Election'
    })
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Elect a council member' }
    })
    fireEvent.change(screen.getByLabelText('Short Description'), {
      target: { value: 'Choose a representative' }
    })
    fireEvent.change(screen.getByLabelText('RadixTalk URL'), {
      target: { value: 'https://radixtalk.com/t/election' }
    })
    assert.isFalse(createButton.hasAttribute('disabled'))
    const form = createButton.closest('form')
    assert.isNotNull(form)
    if (form) fireEvent.submit(form)

    await waitFor(() => {
      assert.isNotNull(
        screen.getByText(
          'Election was not created. Fix the following details and try again:'
        )
      )
    })
    assert.strictEqual(atomMocks.createElection.mock.calls.length, 0)
  })
})
