import { AlertCircle, CalendarClock, ChevronDown, ChevronsUp, ChevronUp } from 'lucide-react'
import { cn, dueState } from '@/lib/utils'
import { formatDate, useLang, useT } from '@/i18n'
import type { Priority, ProjectStatus, Tag } from '@/lib/types'

export function TagChip({ tag, onRemove }: { tag: Pick<Tag, 'name' | 'color'>; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium"
      style={{ background: `${tag.color}22`, color: 'var(--c-fg)' }}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tag.color }} />
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button type="button" aria-label={`Remove ${tag.name}`} onClick={onRemove} className="ml-0.5 text-muted hover:text-fg">
          ×
        </button>
      )}
    </span>
  )
}

const prioStyle: Record<Priority, string> = {
  high: 'text-danger bg-danger-soft',
  medium: 'text-warn bg-warn-soft',
  low: 'text-muted bg-surface-2',
}
const prioIcon = { high: ChevronsUp, medium: ChevronUp, low: ChevronDown }

export function PriorityBadge({ priority, compact = false }: { priority: Priority; compact?: boolean }) {
  const t = useT()
  const Icon = prioIcon[priority]
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded px-1.5 py-px text-[11px] font-medium', prioStyle[priority])}>
      <Icon size={12} aria-hidden />
      {compact ? <span className="sr-only">{t(`priority.${priority}`)}</span> : t(`priority.${priority}`)}
    </span>
  )
}

export function DueBadge({ due, done }: { due: string | null; done: boolean }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const state = dueState(due, done)
  if (!due) return null
  const tone =
    state === 'overdue' ? 'text-danger bg-danger-soft' : state === 'today' ? 'text-warn bg-warn-soft' : 'text-muted bg-surface-2'
  const Icon = state === 'overdue' ? AlertCircle : CalendarClock
  return (
    <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium', tone)}>
      <Icon size={12} aria-hidden />
      {formatDate(lang, due)}
      {state === 'overdue' && <span className="ml-0.5">· {t('due.overdue')}</span>}
      {state === 'today' && <span className="ml-0.5">· {t('due.today')}</span>}
    </span>
  )
}

const statusTone: Record<ProjectStatus, string> = {
  active: 'text-ok bg-ok-soft',
  paused: 'text-warn bg-warn-soft',
  completed: 'text-accent-text bg-accent-soft',
  archived: 'text-muted bg-surface-2',
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const t = useT()
  return <span className={cn('inline-flex rounded px-1.5 py-px text-[11px] font-medium', statusTone[status])}>{t(`status.${status}`)}</span>
}

export function ProgressBar({ value, color, label }: { value: number; color?: string; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color ?? 'var(--c-accent)' }} />
    </div>
  )
}
