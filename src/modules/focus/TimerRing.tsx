import { formatMmss } from '@/lib/utils'
import type { SessionType } from '@/lib/types'

export const KIND_COLOR: Record<SessionType, string> = {
  work: 'var(--c-accent)',
  short_break: 'var(--c-ok)',
  long_break: 'var(--c-warn)',
}

/** Circular countdown. `progress` is the elapsed fraction (0..1). */
export function TimerRing({
  seconds, progress, kind, size = 280, label, sub,
}: {
  seconds: number
  progress: number
  kind: SessionType
  size?: number
  label: string
  sub?: string
}) {
  const stroke = Math.max(6, Math.round(size / 26))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, progress))
  return (
    <div className="relative" style={{ width: size, height: size }} role="timer" aria-label={label} aria-live="off">
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={KIND_COLOR[kind]} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: 'stroke-dashoffset 400ms linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span data-testid="timer-display" className="font-mono font-semibold tabular-nums tracking-tight" style={{ fontSize: size * 0.2 }}>
          {formatMmss(seconds)}
        </span>
        {sub && <span className="mt-1 text-sm text-muted">{sub}</span>}
      </div>
    </div>
  )
}
