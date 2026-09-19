import { describe, expect, it } from 'vitest'
import { pluralIndex, translate } from './index'
import { en } from './en'
import { ru } from './ru'

describe('plural rules', () => {
  it('follows Russian one / few / many', () => {
    const forms = [1, 21, 101].map((n) => pluralIndex('ru', n))
    expect(forms).toEqual([0, 0, 0])
    expect([2, 3, 4, 22, 104].map((n) => pluralIndex('ru', n))).toEqual([1, 1, 1, 1, 1])
    expect([0, 5, 11, 12, 14, 20, 111].map((n) => pluralIndex('ru', n))).toEqual([2, 2, 2, 2, 2, 2, 2])
  })
  it('follows English one / other', () => {
    expect([1, 0, 2, 5].map((n) => pluralIndex('en', n))).toEqual([0, 1, 1, 1])
  })
})

describe('translate', () => {
  it('interpolates params and picks plural forms', () => {
    expect(translate('ru', 'analytics.days', { n: 1 })).toBe('1 день')
    expect(translate('ru', 'analytics.days', { n: 3 })).toBe('3 дня')
    expect(translate('ru', 'analytics.days', { n: 7 })).toBe('7 дней')
    expect(translate('en', 'analytics.days', { n: 1 })).toBe('1 day')
    expect(translate('en', 'analytics.days', { n: 2 })).toBe('2 days')
    expect(translate('en', 'project.tasksDone', { a: 2, b: 5 })).toBe('2 of 5 tasks')
  })
  it('keeps unknown placeholders visible instead of failing', () => {
    expect(translate('en', 'project.tasksDone', { a: 1 })).toBe('1 of {b} tasks')
  })
})

describe('dictionaries', () => {
  it('have exactly the same keys in both languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort())
  })
  it('never leave a value empty and use the same placeholders', () => {
    const ph = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort().join(',')
    for (const key of Object.keys(ru) as Array<keyof typeof ru>) {
      expect(ru[key].trim(), key).not.toBe('')
      expect(en[key].trim(), key).not.toBe('')
      expect(ph(en[key]), `placeholders of ${key}`).toBe(ph(ru[key]))
    }
  })
})
