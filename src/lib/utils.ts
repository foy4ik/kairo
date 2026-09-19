export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 1500 -> "25:00" */
export function formatMmss(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Monday-based start of week. */
export function startOfWeek(d: Date = new Date()): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const shift = (c.getDay() + 6) % 7
  c.setDate(c.getDate() - shift)
  return c
}

/** Minutes east of UTC (the opposite sign of Date#getTimezoneOffset). */
export function tzOffsetMin(): number {
  return -new Date().getTimezoneOffset()
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Deadline state of a task relative to now. */
export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'none'
export function dueState(due: string | null, done: boolean, now: Date = new Date()): DueState {
  if (!due) return 'none'
  if (done) return 'later'
  const d = due.length === 10 ? parseDay(due) : new Date(due)
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - startToday.getTime()) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 3) return 'soon'
  return 'later'
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): ((...a: A) => void) & { cancel(): void } {
  let t: ReturnType<typeof setTimeout> | undefined
  const wrapped = (...a: A) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
  wrapped.cancel = () => t && clearTimeout(t)
  return wrapped
}
