import { describe, expect, it } from 'vitest'
import { getItemStatus } from './StatusBadge'

const start = new Date('2026-08-01T14:12:00.000Z')
const deadline = new Date('2026-08-01T14:19:00.000Z')

describe('getItemStatus', () => {
  it('marks an item as upcoming before voting starts', () => {
    expect(
      getItemStatus(start, deadline, new Date('2026-08-01T14:11:59.999Z'))
    ).toBe('upcoming')
  })

  it('marks an item as active when voting starts', () => {
    expect(getItemStatus(start, deadline, start)).toBe('active')
  })

  it('keeps an item active until its deadline', () => {
    expect(
      getItemStatus(start, deadline, new Date('2026-08-01T14:18:59.999Z'))
    ).toBe('active')
  })

  it('marks an item as closed at its deadline', () => {
    expect(getItemStatus(start, deadline, deadline)).toBe('closed')
  })
})
