import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, CheckCircle2, Clock, Flame, Timer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { DatePicker } from '@/components/DatePicker'
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState'
import { Segmented } from '@/components/Field'
import { formatDate, formatDuration, useLang, useT } from '@/i18n'
import { addDays, dayKey, parseDay, startOfWeek, tzOffsetMin } from '@/lib/utils'
import { analyticsRepo } from '@/lib/repositories'
import { normalizeError } from '@/lib/ipc'
import { useTimer } from '@/store/timer'
import { useData } from '@/store/data'
import type { Analytics, BreakdownItem } from '@/lib/types'

type Period = 'today' | 'week' | 'last7' | 'last30' | 'custom'

export function periodRange(p: Period, now: Date = new Date()): [string, string] {
  switch (p) {
    case 'today': return [dayKey(now), dayKey(now)]
    case 'week': { const s = startOfWeek(now); return [dayKey(s), dayKey(addDays(s, 6))] }
    case 'last7': return [dayKey(addDays(now, -6)), dayKey(now)]
    case 'last30': return [dayKey(addDays(now, -29)), dayKey(now)]
    default: return [dayKey(addDays(now, -6)), dayKey(now)]
  }
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><span className="text-accent-text" aria-hidden>{icon}</span>{label}</div>
      <div className="text-2xl font-semibold tabular-nums tracking-tight" data-testid={`kpi-${label}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  )
}

function Breakdown({ title, items, empty }: { title: string; items: BreakdownItem[]; empty: string }) {
  const t = useT()
  const max = Math.max(1, ...items.map((i) => i.focus_sec))
  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-card" aria-label={title}>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {items.length === 0 ? <p className="text-sm text-muted">{empty}</p> : (
        <ul className="flex flex-col gap-3">
          {items.map((i) => (
            <li key={`${i.id}-${i.name}`}>
              <div className="mb-1 flex justify-between text-sm"><span className="truncate">{i.name || t('analytics.noProject')}</span><span className="tabular-nums text-muted">{formatDuration(t, i.focus_sec)}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(i.focus_sec / max) * 100}%`, background: i.color }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function AnalyticsPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const nav = useNavigate()
  const version = useTimer((s) => s.sessionsVersion)
  const tasks = useData((s) => s.tasks)
  const [period, setPeriod] = useState<Period>('last7')
  const [custom, setCustom] = useState<[string, string]>(periodRange('last7'))
  const [data, setData] = useState<Analytics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [from, to] = period === 'custom' ? custom : periodRange(period)
  const valid = from <= to

  useEffect(() => {
    if (!valid) return
    let alive = true
    analyticsRepo.get(from, to, tzOffsetMin()).then((d) => { if (alive) { setData(d); setError(null) } }).catch((e) => alive && setError(normalizeError(e).message))
    return () => { alive = false }
  }, [from, to, valid, version, tasks])

  const chart = useMemo(() => (data?.days ?? []).map((d) => ({
    ...d,
    minutes: Math.round(d.focus_sec / 60),
    label: data!.days.length > 14 ? String(parseDay(d.date).getDate()) : formatDate(lang, d.date, { weekday: 'short', day: 'numeric' }),
  })), [data, lang])

  const axis = { fontSize: 12, fill: 'var(--c-muted)' }
  const empty = data && data.sessions === 0 && data.completed_tasks === 0

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-5 overflow-y-auto p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.analytics')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {period === 'custom' && (
            <div className="flex items-center gap-1.5">
              <DatePicker label={t('analytics.from')} className="w-40" clearable={false} value={custom[0]} max={custom[1]} onChange={(v) => setCustom([v, custom[1]])} />
              <span className="text-muted">–</span>
              <DatePicker label={t('analytics.to')} className="w-40" clearable={false} value={custom[1]} min={custom[0]} onChange={(v) => setCustom([custom[0], v])} />
            </div>
          )}
          <Segmented<Period> label={t('analytics.period')} value={period} onChange={setPeriod} options={[
            { value: 'today', label: t('period.today') }, { value: 'week', label: t('period.week') },
            { value: 'last7', label: t('period.last7') }, { value: 'last30', label: t('period.last30') }, { value: 'custom', label: t('period.custom') },
          ]} />
        </div>
      </header>

      {!valid && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{t('analytics.badRange')}</p>}
      {error && <ErrorState message={error} />}
      {!data && !error && valid && <div className="grid grid-cols-4 gap-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}

      {data && !error && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi icon={<CheckCircle2 size={14} />} label={t('analytics.completed')} value={String(data.completed_tasks)} />
            <Kpi icon={<Timer size={14} />} label={t('analytics.sessions')} value={String(data.sessions)} />
            <Kpi icon={<Clock size={14} />} label={t('analytics.focusTime')} value={formatDuration(t, data.focus_sec)} />
            <Kpi icon={<Flame size={14} />} label={t('analytics.streak')} value={t('analytics.days', { n: data.streak })} hint={t('analytics.streakHint')} />
          </div>

          {empty ? (
            <div className="rounded-xl border border-dashed border-line-strong bg-surface">
              <EmptyState icon={<BarChart3 size={22} />} title={t('analytics.emptyTitle')} description={t('analytics.emptyText')} action={<Button variant="primary" onClick={() => nav('/focus')}>{t('dashboard.startFocus')}</Button>} />
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                {([['minutes', t('analytics.focusByDay'), 'var(--c-accent)'], ['completed_tasks', t('analytics.completedByDay'), 'var(--c-ok)']] as const).map(([key, title, color]) => (
                  <section key={key} className="rounded-xl border border-line bg-surface p-4 shadow-card" aria-label={title}>
                    <h3 className="mb-3 text-sm font-semibold">{title}</h3>
                    <div className="h-56" role="img" aria-label={title}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chart} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke="var(--c-line)" />
                          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                          <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                          <Tooltip cursor={{ fill: 'var(--c-surface-2)' }} contentStyle={{ background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 8, color: 'var(--c-fg)' }} formatter={(v) => (key === 'minutes' ? [`${v} ${t('analytics.min')}`, title] : [v, title])} />
                          <Bar dataKey={key} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <table className="sr-only"><caption>{title}</caption><tbody>{chart.map((d) => <tr key={d.date}><th>{d.date}</th><td>{d[key]}</td></tr>)}</tbody></table>
                  </section>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Breakdown title={t('analytics.byProject')} items={data.by_project} empty={t('analytics.noData')} />
                <Breakdown title={t('analytics.byTag')} items={data.by_tag} empty={t('analytics.noTagData')} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
