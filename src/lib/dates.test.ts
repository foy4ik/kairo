import { describe, expect, it } from 'vitest'
import { formatDateInput, monthGrid, parseDateInput, shiftMonth } from './dates'
import { dayKey } from './utils'

describe('parseDateInput', () => {
  it('reads Russian day-first dates', () => {
    expect(parseDateInput('22.09.2026', 'ru')).toBe('2026-09-22')
    expect(parseDateInput('2/3/26', 'ru')).toBe('2026-03-02')
    expect(parseDateInput(' 5-11-2027 ', 'ru')).toBe('2027-11-05')
  })
  it('reads English month-first dates', () => {
    expect(parseDateInput('09/22/2026', 'en')).toBe('2026-09-22')
    expect(parseDateInput('2/3/26', 'en')).toBe('2026-02-03')
  })
  it('always accepts ISO', () => {
    expect(parseDateInput('2026-09-22', 'ru')).toBe('2026-09-22')
    expect(parseDateInput('2020-1-2', 'en')).toBe('2020-01-02')
  })
  it('returns empty for empty input and null for nonsense or impossible dates', () => {
    expect(parseDateInput('   ', 'ru')).toBe('')
    expect(parseDateInput('31.02.2026', 'ru')).toBeNull()
    expect(parseDateInput('13/40/2026', 'en')).toBeNull()
    expect(parseDateInput('abc', 'ru')).toBeNull()
    expect(parseDateInput('1.2', 'ru')).toBeNull()
    expect(parseDateInput('01.01.1800', 'ru')).toBeNull()
  })
  it('accepts a leap day only in leap years', () => {
    expect(parseDateInput('29.02.2028', 'ru')).toBe('2028-02-29')
    expect(parseDateInput('29.02.2027', 'ru')).toBeNull()
  })
})

describe('formatDateInput', () => {
  it('round-trips with parseDateInput', () => {
    for (const lang of ['ru', 'en'] as const) {
      expect(parseDateInput(formatDateInput('2026-09-05', lang), lang)).toBe('2026-09-05')
    }
    expect(formatDateInput('2026-09-05', 'ru')).toBe('05.09.2026')
    expect(formatDateInput('2026-09-05', 'en')).toBe('09/05/2026')
    expect(formatDateInput('', 'ru')).toBe('')
  })
})

describe('monthGrid', () => {
  it('has 42 days starting on a Monday and containing the whole month', () => {
    const grid = monthGrid(2026, 8) // September 2026 starts on a Tuesday
    expect(grid).toHaveLength(42)
    expect(grid[0].getDay()).toBe(1)
    expect(dayKey(grid[0])).toBe('2026-08-31')
    expect(grid.filter((d) => d.getMonth() === 8)).toHaveLength(30)
  })
  it('handles a month that starts on Monday', () => {
    expect(dayKey(monthGrid(2026, 5)[0])).toBe('2026-06-01')
  })
})

describe('shiftMonth', () => {
  it('clamps to the end of shorter months and crosses year boundaries', () => {
    expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-28')
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-15')
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-15')
  })
})
