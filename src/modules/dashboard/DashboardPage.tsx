import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, CheckCircle2, Clock, FilePlus2, FolderOpen, Flame, ListPlus, Pause, Play, Timer } from 'lucide-react'
import { Button } from '@/components/Button'
import { Kbd } from '@/components/Kbd'
import { EmptyState, PageLoading } from '@/components/EmptyState'
import { DueBadge, ProgressBar } from '@/components/Chips'
import { ProjectIcon } from '@/components/Icon'
import { formatDate, formatDuration, formatRelative, useLang, useT } from '@/i18n'
import { dayKey, dueState, formatMmss, tzOffsetMin } from '@/lib/utils'
import { analyticsRepo, notesRepo, timerRepo } from '@/lib/repositories'
import { useData } from '@/store/data'
import { useTimer } from '@/store/timer'
import { useUi } from '@/store/ui'
import { snippet } from '@/modules/notes/markdownFormat'
import type { Analytics, FocusSession } from '@/lib/types'

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent-text" aria-hidden>{icon}</span>
      <div>
        <div className="text-xl font-semibold tabular-nums leading-tight" data-testid={`stat-${label}`}>{value}</div>
        <div className="text-xs text-muted">{label}</div>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const nav = useNavigate()
  const { projects, tasks, notes, loaded } = useData()
  const timer = useTimer((s) => s.state)
  const version = useTimer((s) => s.sessionsVersion)
  const [today, setToday] = useState<Analytics | null>(null)
  const [last, setLast] = useState<FocusSession | null>(null)
  const ui = useUi.getState

  useEffect(() => {
    const key = dayKey()
    void analyticsRepo.get(key, key, tzOffsetMin()).then(setToday).catch(() => setToday(null))
    void timerRepo.sessions(null, null, 1).then((s) => setLast(s[0] ?? null)).catch(() => undefined)
  }, [version, tasks])

  const hour = new Date().getHours()
  const greeting = hour < 5 ? t('dashboard.night') : hour < 12 ? t('dashboard.morning') : hour < 18 ? t('dashboard.afternoon') : t('dashboard.evening')

  const todayTasks = useMemo(() =>
    tasks
      .filter((x) => !x.completed_at)
      .map((x) => ({ x, s: dueState(x.due_at, false) }))
      .filter(({ x, s }) => s === 'overdue' || s === 'today' || (s === 'soon' && x.priority === 'high'))
      .sort((a, b) => (a.x.due_at ?? '').localeCompare(b.x.due_at ?? ''))
      .slice(0, 6).map(({ x }) => x),
  [tasks])

  if (!loaded) return <PageLoading />

  const activeProjects = projects.filter((p) => p.status === 'active')
  const currentProject = timer && timer.project_id ? projects.find((p) => p.id === timer.project_id) : activeProjects[0]
  const running = timer && (timer.phase === 'running' || timer.phase === 'paused')
  const lastTask = tasks.find((x) => x.id === last?.task_id)
  const recentNotes = notes.slice(0, 4)
  const recentProjects = [...projects].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4)
  const isEmpty = projects.length === 0

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 overflow-y-auto p-8" style={{ height: '100%' }}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
          <p className="mt-0.5 text-sm text-muted first-letter:uppercase">{formatDate(lang, new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('dashboard.quick')}>
          <Button variant="primary" onClick={() => ui().openNewTask()}><ListPlus size={15} />{t('dashboard.newTask')} <Kbd className="ml-1 border-white/30 bg-white/10 text-white">N</Kbd></Button>
          <Button onClick={() => nav('/focus')}><Timer size={15} />{t('dashboard.startFocus')}</Button>
          <Button onClick={async () => { const n = await notesRepo.create({ title: t('note.untitled'), content: '', project_id: currentProject?.id ?? null, tags: [], task_ids: [] }); await useData.getState().refreshNotes(); nav(`/notes/${n.id}`) }}><FilePlus2 size={15} />{t('dashboard.newNote')}</Button>
          <Button onClick={() => nav('/projects')}><FolderOpen size={15} />{t('dashboard.openProject')}</Button>
        </div>
      </header>

      {isEmpty ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface">
          <EmptyState icon={<FolderOpen size={22} />} title={t('dashboard.emptyTitle')} description={t('dashboard.emptyText')}
            action={<Button variant="primary" onClick={() => ui().setProjectDialog({ mode: 'create' })}>{t('project.new')}</Button>} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={<CheckCircle2 size={18} />} label={t('analytics.completed')} value={String(today?.completed_tasks ?? 0)} />
            <Stat icon={<Clock size={18} />} label={t('analytics.focusTime')} value={formatDuration(t, today?.focus_sec ?? 0)} />
            <Stat icon={<Timer size={18} />} label={t('analytics.sessions')} value={String(today?.sessions ?? 0)} />
            <Stat icon={<Flame size={18} />} label={t('analytics.streak')} value={t('analytics.days', { n: today?.streak ?? 0 })} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-line bg-surface p-4 shadow-card lg:col-span-2" aria-label={t('dashboard.today')}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CalendarCheck size={15} className="text-accent-text" aria-hidden />{t('dashboard.today')}</h2>
              {todayTasks.length === 0 ? (
                <p className="rounded-lg bg-surface-2 px-3 py-4 text-sm text-muted">{t('dashboard.todayEmpty')}</p>
              ) : (
                <ul className="flex flex-col" data-testid="today-list">
                  {todayTasks.map((x) => (
                    <li key={x.id}>
                      <button onClick={() => ui().openTask(x.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2">
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: projects.find((p) => p.id === x.project_id)?.color }} />
                        <span className="flex-1 truncate text-sm">{x.title}</span>
                        <DueBadge due={x.due_at} done={false} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-line bg-surface p-4 shadow-card" aria-label={t('nav.focus')}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Timer size={15} className="text-accent-text" aria-hidden />{t('nav.focus')}</h2>
              {running && timer ? (
                <div className="flex flex-col gap-3">
                  <div className="text-3xl font-semibold tabular-nums">{formatMmss(timer.remaining_sec)}</div>
                  <div className="text-sm text-muted">{t(`timer.type.${timer.type}`)}{timer.task_id ? ` · ${tasks.find((x) => x.id === timer.task_id)?.title ?? ''}` : ''}</div>
                  <div className="flex gap-2">
                    {timer.phase === 'running'
                      ? <Button onClick={() => void useTimer.getState().pause()}><Pause size={14} />{t('timer.pause')}</Button>
                      : <Button variant="primary" onClick={() => void useTimer.getState().resume()}><Play size={14} />{t('timer.resume')}</Button>}
                    <Button onClick={() => nav('/focus')}>{t('common.open')}</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {last ? (
                    <p className="text-sm text-muted">{t('dashboard.lastSession', { d: formatDuration(t, last.duration_sec), when: formatRelative(lang, last.ended_at) })}{lastTask ? <><br /><span className="text-fg">{lastTask.title}</span></> : null}</p>
                  ) : <p className="text-sm text-muted">{t('dashboard.noSessions')}</p>}
                  <Button variant="primary" onClick={() => nav('/focus')}><Play size={14} />{t('dashboard.startFocus')}</Button>
                </div>
              )}
            </section>
          </div>

          <section aria-label={t('dashboard.progress')}>
            <h2 className="mb-3 text-sm font-semibold">{t('dashboard.progress')}</h2>
            {activeProjects.length === 0 ? <p className="text-sm text-muted">{t('dashboard.noActive')}</p> : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" data-testid="project-progress">
                {activeProjects.map((p) => (
                  <button key={p.id} onClick={() => nav(`/projects/${p.id}`)} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-line-strong">
                    <div className="flex items-center gap-2.5"><ProjectIcon icon={p.icon} color={p.color} size={26} /><span className="truncate text-sm font-semibold">{p.name}</span></div>
                    <ProgressBar value={p.task_total ? p.task_done / p.task_total : 0} color={p.color} label={p.name} />
                    <div className="flex justify-between text-xs text-muted"><span>{t('project.tasksDone', { a: p.task_done, b: p.task_total })}</span><span>{formatDuration(t, p.focus_sec)}</span></div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-line bg-surface p-4 shadow-card" aria-label={t('dashboard.recentNotes')}>
              <h2 className="mb-2 text-sm font-semibold">{t('dashboard.recentNotes')}</h2>
              {recentNotes.length === 0 ? <p className="text-sm text-muted">{t('notes.emptyText')}</p> : (
                <ul>{recentNotes.map((n) => (
                  <li key={n.id}><button onClick={() => nav(`/notes/${n.id}`)} className="flex w-full flex-col rounded-lg px-2 py-1.5 text-left hover:bg-surface-2">
                    <span className="truncate text-sm font-medium">{n.title}</span>
                    <span className="truncate text-xs text-muted">{snippet(n.content) || t('note.empty')} · {formatRelative(lang, n.updated_at)}</span>
                  </button></li>
                ))}</ul>
              )}
            </section>
            <section className="rounded-xl border border-line bg-surface p-4 shadow-card" aria-label={t('dashboard.recentProjects')}>
              <h2 className="mb-2 text-sm font-semibold">{t('dashboard.recentProjects')}</h2>
              <ul>{recentProjects.map((p) => (
                <li key={p.id}><button onClick={() => nav(`/projects/${p.id}`)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2">
                  <ProjectIcon icon={p.icon} color={p.color} size={22} /><span className="flex-1 truncate text-sm">{p.name}</span><span className="text-xs text-muted">{formatRelative(lang, p.updated_at)}</span>
                </button></li>
              ))}</ul>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
