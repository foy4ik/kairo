import { describe, expect, it } from 'vitest'
import { periodRange } from './AnalyticsPage'

describe('periodRange', () => {
  const now = new Date(2026, 8, 19) // Saturday
  it('covers the expected calendar days', () => {
    expect(periodRange('today', now)).toEqual(['2026-09-19', '2026-09-19'])
    expect(periodRange('week', now)).toEqual(['2026-09-14', '2026-09-20'])
    expect(periodRange('last7', now)).toEqual(['2026-09-13', '2026-09-19'])
    expect(periodRange('last30', now)).toEqual(['2026-08-21', '2026-09-19'])
  })
})
