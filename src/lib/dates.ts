import { addDays, dayKey, pad, parseDay } from '@/lib/utils'

export type DateLang = 'ru' | 'en'

/** ISO `YYYY-MM-DD` -> text in the user's convention (`22.09.2026` / `09/22/2026`). */
export function formatDateInput(iso: string, lang: DateLang): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return lang === 'ru' ? `${d}.${m}.${y}` : `${m}/${d}/${y}`
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2100) return false
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/**
 * Parses what a person types: ISO, `22.09.2026` / `22/9/26` (ru: day first) or `9/22/2026` (en: month first).
 * Returns the ISO string, `''` for empty input and `null` when the text is not a real date.
 */
export function parseDateInput(text: string, lang: DateLang): string | null {
  const s = text.trim()
  if (!s) return ''
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  let y: number, m: number, d: number
  if (iso) {
    ;[y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  } else {
    const parts = s.split(/[./\-\s]+/)
    if (parts.length !== 3 || parts.some((p) => !/^\d{1,4}$/.test(p))) return null
    const [a, b, c] = parts.map(Number)
    y = c < 100 ? 2000 + c : c
    ;[m, d] = lang === 'ru' ? [b, a] : [a, b]
  }
  return isRealDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null
}

/** The 42 days (6 weeks, Monday first) shown for a month. */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const shift = (first.getDay() + 6) % 7
  const start = addDays(first, -shift)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export const todayIso = (): string => dayKey(new Date())

export function shiftMonth(iso: string, delta: number): string {
  const d = parseDay(iso)
  const target = new Date(d.getFullYear(), d.getMonth() + delta, 1)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(d.getDate(), last))
  return dayKey(target)
}
