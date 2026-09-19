import { describe, expect, it } from 'vitest'
import { parseQuickAdd } from './quickAdd'

describe('parseQuickAdd', () => {
  it('extracts tags and priority from the title', () => {
    expect(parseQuickAdd('Write docs #docs #v1 !high')).toEqual({ title: 'Write docs', tags: ['docs', 'v1'], priority: 'high' })
  })
  it('keeps plain titles untouched', () => {
    expect(parseQuickAdd('  Buy   milk ')).toEqual({ title: 'Buy milk', tags: [], priority: null })
  })
  it('ignores a lone # and unknown ! tokens', () => {
    expect(parseQuickAdd('Fix # bug !wow')).toEqual({ title: 'Fix # bug !wow', tags: [], priority: null })
  })
  it('supports short priority tokens in any position', () => {
    expect(parseQuickAdd('!l first #x')).toEqual({ title: 'first', tags: ['x'], priority: 'low' })
  })
})
