import { useCallback } from 'react'
import { create } from 'zustand'
import { ru } from './ru'
import { en } from './en'

export type Lang = 'ru' | 'en'
export type Key = keyof typeof ru
type Params = Record<string, string | number>

const dicts: Record<Lang, Record<Key, string>> = { ru, en }

export const useLang = create<{ lang: Lang; setLang: (l: Lang) => void }>((set) => ({
  lang: 'ru',
  setLang: (lang) => set({ lang }),
}))

/** Picks the plural form of "one|few|many" (ru) or "one|other" (en). */
export function pluralIndex(lang: Lang, n: number): number {
  const a = Math.abs(n)
  if (lang === 'en') return a === 1 ? 0 : 1
  const m10 = a % 10
  const m100 = a % 100
  if (m10 === 1 && m100 !== 11) return 0
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 1
  return 2
}

export function translate(lang: Lang, key: Key, params?: Params): string {
  let s = dicts[lang][key] ?? dicts.en[key] ?? key
  if (params && typeof params.n === 'number' && s.includes('|')) {
    const forms = s.split('|')
    s = forms[Math.min(pluralIndex(lang, params.n), forms.length - 1)]
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`))
  return s
}

export type TFn = (key: Key, params?: Params) => string

/** Reactive translator: components re-render when the language changes, without a reload. */
export function useT(): TFn {
  const lang = useLang((s) => s.lang)
  return useCallback((key, params) => translate(lang, key, params), [lang])
}

/** Non-reactive translator for code outside React (store actions, toasts). */
export const t: TFn = (key, params) => translate(useLang.getState().lang, key, params)

export function locale(lang: Lang): string {
  return lang === 'ru' ? 'ru-RU' : 'en-US'
}

export function formatDuration(tr: TFn, sec: number): string {
  const total = Math.max(0, Math.round(sec))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return m > 0 ? `${tr('dur.h', { n: h })} ${tr('dur.m', { n: m })}` : tr('dur.h', { n: h })
  if (m > 0) return tr('dur.m', { n: m })
  return total > 0 ? tr('dur.s', { n: total }) : tr('dur.m', { n: 0 })
}

export function formatDate(lang: Lang, iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso)
  return new Intl.DateTimeFormat(locale(lang), opts).format(d)
}

export function formatRelative(lang: Lang, iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' })
  const abs = Math.abs(diff)
  if (abs < 60) return rtf.format(Math.round(diff), 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  return formatDate(lang, iso, { day: 'numeric', month: 'short', year: 'numeric' })
}
