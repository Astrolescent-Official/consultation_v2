import { assert, describe, it } from 'vitest'
import { createdConsultationDestination } from './index'

describe('created consultation destination', () => {
  it('opens a newly-created majority judgment temperature check', () => {
    assert.deepStrictEqual(
      createdConsultationDestination({
        election_id: 42,
        temperature_check_id: 7
      }),
      { to: '/tc/$id', id: '7' }
    )
  })

  it('opens a newly-created standard temperature check', () => {
    assert.deepStrictEqual(
      createdConsultationDestination({ temperature_check_id: 7 }),
      { to: '/tc/$id', id: '7' }
    )
  })
})
