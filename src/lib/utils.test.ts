import { describe, expect, it } from 'vitest'
import { addDays, dayKey, dueState, formatMmss, parseDay, startOfWeek } from './utils'

describe('formatMmss', () => {
  it('formats minutes and seconds', () => {
    expect(formatMmss(1500)).toBe('25:00')
    expect(formatMmss(65)).toBe('01:05')
    expect(formatMmss(0)).toBe('00:00')
  })
  it('adds hours only when needed and clamps negatives', () => {
    expect(formatMmss(3725)).toBe('1:02:05')
    expect(formatMmss(-4)).toBe('00:00')
  })
})

describe('dates', () => {
  it('round-trips local day keys', () => {
    const d = new Date(2026, 8, 5)
    expect(dayKey(d)).toBe('2026-09-05')
    expect(dayKey(parseDay('2026-09-05'))).toBe('2026-09-05')
  })
  it('handles month boundaries', () => {
    expect(dayKey(addDays(new Date(2026, 0, 31), 1))).toBe('2026-02-01')
  })
  it('starts the week on Monday', () => {
    expect(dayKey(startOfWeek(new Date(2026, 8, 19)))).toBe('2026-09-14') // Saturday
    expect(dayKey(startOfWeek(new Date(2026, 8, 14)))).toBe('2026-09-14') // Monday
    expect(dayKey(startOfWeek(new Date(2026, 8, 20)))).toBe('2026-09-14') // Sunday
  })
})

describe('dueState', () => {
  const now = new Date(2026, 8, 19, 15, 0)
  it('classifies deadlines', () => {
    expect(dueState('2026-09-18', false, now)).toBe('overdue')
    expect(dueState('2026-09-19', false, now)).toBe('today')
    expect(dueState('2026-09-21', false, now)).toBe('soon')
    expect(dueState('2026-10-30', false, now)).toBe('later')
    expect(dueState(null, false, now)).toBe('none')
  })
  it('never flags finished tasks as overdue', () => {
    expect(dueState('2020-01-01', true, now)).toBe('later')
  })
})
