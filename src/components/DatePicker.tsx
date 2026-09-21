import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, dayKey, parseDay } from '@/lib/utils'
import { formatDateInput, monthGrid, parseDateInput, shiftMonth, todayIso } from '@/lib/dates'
import { locale, useLang, useT } from '@/i18n'
import { Button } from './Button'
import { Input } from './Field'

interface Props {
  /** ISO `YYYY-MM-DD`, or empty for "no date". */
  value: string
  onChange: (iso: string) => void
  label: string
  min?: string
  max?: string
  className?: string
  id?: string
  disabled?: boolean
  /** Allow clearing the date. Default true. */
  clearable?: boolean
}

const POPOVER_W = 288
const POPOVER_H = 332

/**
 * Own date field instead of `<input type="date">`: the native popup is a separate system window in some webviews
 * (WebKitGTK on Linux) that does not close after picking a date, is not localised and cannot be styled.
 * Type a date (ru: 22.09.2026, en: 09/22/2026, or ISO) or pick it in the calendar; Esc / outside click closes.
 */
export function DatePicker({ value, onChange, label, min, max, className, id, disabled, clearable = true }: Props) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const loc = locale(lang)
  const uid = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(formatDateInput(value, lang))
  const [invalid, setInvalid] = useState(false)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(value || todayIso()) // any day of the shown month
  const [focusDay, setFocusDay] = useState(value || todayIso())
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 })

  useEffect(() => { setDraft(formatDateInput(value, lang)); setInvalid(false) }, [value, lang])

  const within = useCallback((iso: string) => (!min || iso >= min) && (!max || iso <= max), [min, max])

  const place = useCallback(() => {
    const r = wrap.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POPOVER_W - 8))
    if (r.bottom + POPOVER_H + 8 > window.innerHeight && r.top > POPOVER_H + 8) setPos({ left, bottom: window.innerHeight - r.top + 6 })
    else setPos({ left, top: r.bottom + 6 })
  }, [])

  const close = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) input.current?.focus()
  }, [])

  const choose = (iso: string) => {
    if (!within(iso)) return
    onChange(iso)
    close()
  }

  const commit = () => {
    const parsed = parseDateInput(draft, lang)
    if (parsed === null || (parsed && !within(parsed))) { setInvalid(true); return }
    setInvalid(false)
    if (parsed === '' && !clearable) { setDraft(formatDateInput(value, lang)); return }
    if (parsed !== value) onChange(parsed)
    else setDraft(formatDateInput(value, lang))
  }

  const openCalendar = () => {
    if (disabled) return
    const parsed = parseDateInput(draft, lang)
    const start = parsed || value || todayIso()
    setView(start)
    setFocusDay(start)
    place()
    setOpen(true)
  }

  useLayoutEffect(() => { if (open) place() }, [open, place])

  // Close on outside press, Esc and when the page scrolls or resizes underneath.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      if (!pop.current?.contains(n) && !wrap.current?.contains(n)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close() }
    }
    const onMove = () => place()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true) // capture: runs before a surrounding dialog's own Esc handler
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, close, place])

  // Move keyboard focus to the highlighted day.
  useEffect(() => {
    if (open) pop.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus()
  }, [open, focusDay])

  const grid = useMemo(() => {
    const d = parseDay(view)
    return monthGrid(d.getFullYear(), d.getMonth())
  }, [view])
  const viewMonth = parseDay(view).getMonth()
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(new Date(2024, 0, 1 + i))), [loc])
  const title = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(parseDay(view))
  const today = todayIso()

  const go = (iso: string) => { setFocusDay(iso); setView(iso) }
  const onGridKey = (e: React.KeyboardEvent) => {
    if (!(e.target as HTMLElement).dataset.day) return // month buttons keep their default keys
    const d = parseDay(focusDay)
    const step = (days: number) => { e.preventDefault(); const n = new Date(d); n.setDate(d.getDate() + days); go(dayKey(n)) }
    if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'ArrowRight') step(1)
    else if (e.key === 'ArrowUp') step(-7)
    else if (e.key === 'ArrowDown') step(7)
    else if (e.key === 'PageUp') { e.preventDefault(); go(shiftMonth(focusDay, -1)) }
    else if (e.key === 'PageDown') { e.preventDefault(); go(shiftMonth(focusDay, 1)) }
  }

  return (
    <div ref={wrap} className={cn('relative', className)}>
      <Input
        ref={input} id={id} value={draft} disabled={disabled} inputMode="numeric" autoComplete="off" invalid={invalid}
        aria-label={label} placeholder={t('date.placeholder')} className="pr-9"
        onChange={(e) => { setDraft(e.target.value); setInvalid(false) }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); commit() }
          else if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); openCalendar() }
        }}
      />
      <button
        type="button" disabled={disabled} aria-label={t('date.pick')} aria-haspopup="dialog" aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()} // keep the typed text focused until the click, so blur-commit runs once
        onClick={() => (open ? close(false) : openCalendar())}
        className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50"
      >
        <CalendarDays size={15} aria-hidden />
      </button>
      {invalid && (
        <p role="alert" className="mt-1 flex items-center gap-1 text-xs text-danger">
          <AlertCircle size={12} aria-hidden />{t('date.invalid', { example: formatDateInput('2026-09-22', lang) })}
        </p>
      )}

      {open && createPortal(
        <div
          ref={pop} role="dialog" aria-label={`${t('date.pick')}: ${label}`} id={`${uid}-cal`}
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: POPOVER_W }}
          className="z-[80] rounded-xl border border-line bg-surface p-3 shadow-pop animate-pop-in"
          onKeyDown={onGridKey}
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label={t('date.prevMonth')} onClick={() => go(shiftMonth(view, -1))} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"><ChevronLeft size={16} /></button>
            <span className="text-sm font-semibold first-letter:uppercase" aria-live="polite">{title}</span>
            <button type="button" aria-label={t('date.nextMonth')} onClick={() => go(shiftMonth(view, 1))} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] font-medium uppercase text-muted" aria-hidden>
            {weekdays.map((w) => <span key={w} className="py-1">{w}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5" role="group" aria-label={title}>
            {grid.map((d) => {
              const iso = dayKey(d)
              const selected = iso === value
              const outside = d.getMonth() !== viewMonth
              const disabledDay = !within(iso)
              return (
                <button
                  key={iso} type="button" data-day={iso} disabled={disabledDay} tabIndex={iso === focusDay ? 0 : -1}
                  aria-pressed={selected} aria-current={iso === today ? 'date' : undefined}
                  aria-label={new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)}
                  onClick={() => choose(iso)}
                  className={cn(
                    'h-9 rounded-md text-sm tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-30',
                    selected ? 'bg-accent font-semibold text-white' : outside ? 'text-muted hover:bg-surface-2' : 'text-fg hover:bg-surface-2',
                    !selected && iso === today && 'border border-accent text-accent-text',
                  )}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <Button size="sm" variant="ghost" onClick={() => choose(today)} disabled={!within(today)}>{t('date.today')}</Button>
            {clearable && value && <Button size="sm" variant="ghost" onClick={() => { onChange(''); close() }}>{t('common.clear')}</Button>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
