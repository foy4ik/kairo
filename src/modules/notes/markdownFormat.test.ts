import { describe, expect, it } from 'vitest'
import { applyFormat, snippet } from './markdownFormat'
import { toggleTaskInSource } from '@/components/Markdown'

describe('applyFormat', () => {
  it('wraps the selection in bold markers and keeps it selected', () => {
    const r = applyFormat('hello world', 6, 11, 'bold')
    expect(r.value).toBe('hello **world**')
    expect(r.value.slice(r.start, r.end)).toBe('world')
  })
  it('inserts a placeholder when nothing is selected', () => {
    const r = applyFormat('', 0, 0, 'italic')
    expect(r.value).toBe('*italic*')
  })
  it('toggles a line prefix on and off', () => {
    const on = applyFormat('one\ntwo', 0, 7, 'list')
    expect(on.value).toBe('- one\n- two')
    const off = applyFormat(on.value, 0, on.value.length, 'list')
    expect(off.value).toBe('one\ntwo')
  })
  it('creates a checkbox line', () => {
    expect(applyFormat('todo', 2, 2, 'checkbox').value).toBe('- [ ] todo')
  })
  it('builds a link and selects the url placeholder', () => {
    const r = applyFormat('see docs', 4, 8, 'link')
    expect(r.value).toBe('see [docs](https://)')
    expect(r.value.slice(r.start, r.end)).toBe('https://')
  })
})

describe('snippet', () => {
  it('skips blank lines and strips markdown', () => {
    expect(snippet('\n\n# **Title** with [link](http://x)\nbody')).toBe('Title with link')
  })
  it('truncates long lines', () => {
    expect(snippet('x'.repeat(200), 20)).toHaveLength(20)
  })
})

describe('toggleTaskInSource', () => {
  const src = '- [ ] a\n- [x] b\ntext [ ] not a task\n1. [ ] c'
  it('toggles only the n-th checkbox', () => {
    expect(toggleTaskInSource(src, 0)).toBe('- [x] a\n- [x] b\ntext [ ] not a task\n1. [ ] c')
    expect(toggleTaskInSource(src, 1)).toBe('- [ ] a\n- [ ] b\ntext [ ] not a task\n1. [ ] c')
    expect(toggleTaskInSource(src, 2)).toBe('- [ ] a\n- [x] b\ntext [ ] not a task\n1. [x] c')
  })
})
