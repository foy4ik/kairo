import { useEffect, useMemo, useState } from 'react'
import { Coffee, Pause, Play, RotateCcw, Square, SkipForward, Timer as TimerIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/Button'
import { Kbd } from '@/components/Kbd'
import { Select } from '@/components/Field'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'
import { formatDate, formatDuration, useLang, useT } from '@/i18n'
import { useTimer } from '@/store/timer'
import { useData } from '@/store/data'
import { useSettings } from '@/store/settings'
import { timerRepo } from '@/lib/repositories'
import type { FocusSession, SessionType } from '@/lib/types'
import { KIND_COLOR, TimerRing } from './TimerRing'

const KINDS: SessionType[] = ['work', 'short_break', 'long_break']

export function FocusPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const timer = useTimer((s) => s.state)
  const version = useTimer((s) => s.sessionsVersion)
  const settings = useSettings((s) => s.settings)
  const tasks = useData((s) => s.tasks)
  const projects = useData((s) => s.projects)
  const [kind, setKind] = useState<SessionType>('work')
  const [taskId, setTaskId] = useState<number | ''>('')
  const [sessions, setSessions] = useState<FocusSession[]>([])

  useEffect(() => { void timerRepo.sessions(null, null, 30).then(setSessions) }, [version])

  const phase = timer?.phase ?? 'idle'
  const active = phase === 'running' || phase === 'paused'
  const shownKind = active || phase === 'completed' ? timer!.type : kind
  // After a finished session the suggested next type is preselected.
  useEffect(() => { if (phase === 'completed' && timer) setKind(timer.next_type) }, [phase, timer])
  useEffect(() => { if (active && timer?.task_id) setTaskId(timer.task_id) }, [active, timer?.task_id])

  const openTasks = useMemo(() => tasks.filter((x) => !x.completed_at), [tasks])
  const total = timer && (active || phase === 'completed') ? timer.total_sec : (kind === 'work' ? settings.work_min : kind === 'short_break' ? settings.short_break_min : settings.long_break_min) * 60
  const remaining = timer && active ? timer.remaining_sec : phase === 'completed' ? 0 : total
  const progress = active || phase === 'completed' ? 1 - remaining / Math.max(1, total) : 0
  const currentTask = tasks.find((x) => x.id === (active ? timer?.task_id : taskId))
  const currentProject = projects.find((p) => p.id === currentTask?.project_id)

  const start = (k: SessionType) => void useTimer.getState().start(k, k === 'work' && taskId !== '' ? taskId : null)
  const dots = timer ? timer.completed_work_sessions % settings.long_break_every : 0

  const today = new Date().toDateString()
  const todays = sessions.filter((s) => new Date(s.started_at).toDateString() === today)
  const todayFocus = todays.filter((s) => s.type === 'work').reduce((a, s) => a + s.duration_sec, 0)

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-8 overflow-y-auto p-8 lg:flex-row">
      <section className="flex flex-1 flex-col items-center gap-6" aria-label={t('nav.focus')}>
        <div role="tablist" aria-label={t('focus.type')} className="inline-flex rounded-lg border border-line bg-surface p-1">
          {KINDS.map((k) => (
            <button
              key={k} role="tab" aria-selected={shownKind === k} disabled={active || phase === 'completed'} onClick={() => setKind(k)}
              className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-colors', shownKind === k ? 'bg-accent-soft text-accent-text' : 'text-muted hover:text-fg', (active || phase === 'completed') && shownKind !== k && 'opacity-40')}
            >
              {t(`timer.type.${k}`)}
            </button>
          ))}
        </div>

        <TimerRing
          seconds={remaining} progress={progress} kind={shownKind} label={t('focus.timerLabel')}
          sub={phase === 'paused' ? t('timer.paused') : phase === 'completed' ? t('timer.completed') : active ? t(`timer.type.${shownKind}`) : t('timer.ready')}
        />

        <div className="flex items-center gap-2" aria-hidden={false}>
          <span className="sr-only" role="status" aria-live="polite">{phase === 'running' ? t('timer.running') : phase === 'paused' ? t('timer.paused') : phase === 'completed' ? t('timer.completed') : ''}</span>
          {phase === 'idle' && <Button variant="primary" className="h-10 px-6 text-[15px]" onClick={() => start(kind)}><Play size={16} />{t('timer.start')}</Button>}
          {phase === 'running' && <Button variant="primary" className="h-10 px-6 text-[15px]" onClick={() => void useTimer.getState().pause()}><Pause size={16} />{t('timer.pause')} <Kbd className="ml-1 border-white/30 bg-white/10 text-white">Space</Kbd></Button>}
          {phase === 'paused' && <Button variant="primary" className="h-10 px-6 text-[15px]" onClick={() => void useTimer.getState().resume()}><Play size={16} />{t('timer.resume')} <Kbd className="ml-1 border-white/30 bg-white/10 text-white">Space</Kbd></Button>}
          {active && <Button className="h-10" onClick={() => void useTimer.getState().stop()}><Square size={14} />{t('timer.stop')}</Button>}
          {phase === 'completed' && timer && (
            <>
              <Button variant="primary" className="h-10 px-5" onClick={() => start(timer.next_type)}>
                {timer.next_type === 'work' ? <Play size={16} /> : <Coffee size={16} />}{t('timer.startNext', { type: t(`timer.type.${timer.next_type}`) })}
              </Button>
              <Button className="h-10" onClick={() => void useTimer.getState().dismiss()}><SkipForward size={14} />{t('timer.skip')}</Button>
            </>
          )}
        </div>

        {(phase === 'idle' || phase === 'completed') && shownKind === 'work' ? (
          <label className="flex w-full max-w-sm flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-muted">{t('focus.task')}</span>
            <Select value={taskId} onChange={(e) => setTaskId(e.target.value ? Number(e.target.value) : '')} data-testid="focus-task-select">
              <option value="">{t('focus.noTask')}</option>
              {projects.filter((p) => openTasks.some((x) => x.project_id === p.id)).map((p) => (
                <optgroup key={p.id} label={p.name}>
                  {openTasks.filter((x) => x.project_id === p.id).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                </optgroup>
              ))}
            </Select>
          </label>
        ) : active && shownKind === 'work' ? (
          <div className="flex max-w-sm items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <span className="h-2 w-2 rounded-full" style={{ background: currentProject?.color ?? KIND_COLOR.work }} aria-hidden />
            <span className="truncate">{currentTask ? currentTask.title : t('focus.noTask')}</span>
          </div>
        ) : null}

        <div className="flex items-center gap-2 text-xs text-muted" aria-label={t('focus.progress', { a: dots, b: settings.long_break_every })}>
          {Array.from({ length: settings.long_break_every }, (_, i) => (
            <span key={i} className={cn('h-2 w-2 rounded-full', i < dots ? 'bg-accent' : 'bg-control')} aria-hidden />
          ))}
          <span>{t('focus.untilLong', { n: settings.long_break_every - dots })}</span>
        </div>
      </section>

      <section className="w-full lg:w-80" aria-label={t('focus.history')}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">{t('focus.today')}</h2>
          <span className="text-xs text-muted">{formatDuration(t, todayFocus)}</span>
        </div>
        {todays.length === 0 ? (
          <EmptyState className="rounded-xl border border-dashed border-line py-8" icon={<TimerIcon size={20} />} title={t('focus.emptyTitle')} description={t('focus.emptyText')} />
        ) : (
          <ul className="flex flex-col gap-1.5" data-testid="session-list">
            {todays.map((s) => {
              const task = tasks.find((x) => x.id === s.task_id)
              const project = projects.find((p) => p.id === s.project_id)
              return (
                <li key={s.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                  <span aria-hidden className="h-8 w-1 rounded-full" style={{ background: s.type === 'work' ? (project?.color ?? KIND_COLOR.work) : KIND_COLOR[s.type] }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.type === 'work' ? (task?.title ?? t('focus.noTask')) : t(`timer.type.${s.type}`)}</div>
                    <div className="text-xs text-muted">{formatDate(lang, s.started_at, { hour: '2-digit', minute: '2-digit' })}{project ? ` · ${project.name}` : ''}</div>
                  </div>
                  <span className="text-sm tabular-nums text-muted">{formatDuration(t, s.duration_sec)}</span>
                </li>
              )
            })}
          </ul>
        )}
        <Link to="/analytics" className="mt-3 inline-flex items-center gap-1 text-sm text-accent-text hover:underline"><RotateCcw size={13} aria-hidden />{t('focus.allAnalytics')}</Link>
      </section>
    </div>
  )
}
