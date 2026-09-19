import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Archive, ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/Modal'
import { Menu } from '@/components/Menu'
import { EmptyState, ErrorState, PageLoading } from '@/components/EmptyState'
import { ProjectIcon } from '@/components/Icon'
import { ProgressBar, StatusBadge } from '@/components/Chips'
import { cn } from '@/lib/utils'
import { formatDate, formatDuration, useLang, useT } from '@/i18n'
import { useData } from '@/store/data'
import { useUi } from '@/store/ui'
import { useTimer } from '@/store/timer'
import { projectsRepo, timerRepo } from '@/lib/repositories'
import { attempt } from '@/lib/errors'
import { toast } from '@/store/toast'
import type { FocusSession } from '@/lib/types'
import { Board } from '@/modules/tasks/Board'
import { NotesWorkspace } from '@/modules/notes/NotesWorkspace'
import { FilesTab } from './FilesTab'

type Tab = 'board' | 'notes' | 'files' | 'focus'
const TABS: Tab[] = ['board', 'notes', 'files', 'focus']

function FocusHistory({ projectId }: { projectId: number }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const version = useTimer((s) => s.sessionsVersion)
  const tasks = useData((s) => s.tasks)
  const [sessions, setSessions] = useState<FocusSession[] | null>(null)
  useEffect(() => { void timerRepo.sessions(projectId, null, 200).then((s) => setSessions(s.filter((x) => x.type === 'work'))) }, [projectId, version])
  if (!sessions) return null
  const total = sessions.reduce((a, s) => a + s.duration_sec, 0)
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-6">
      {sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface"><EmptyState icon={<Plus size={22} />} title={t('project.noFocusTitle')} description={t('project.noFocusText')} /></div>
      ) : (
        <>
          <div className="flex gap-6 text-sm"><span>{t('analytics.sessions')}: <b>{sessions.length}</b></span><span>{t('analytics.focusTime')}: <b>{formatDuration(t, total)}</b></span></div>
          <ul className="flex flex-col gap-1.5" data-testid="project-sessions">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-2.5 text-sm">
                <div><div className="font-medium">{tasks.find((x) => x.id === s.task_id)?.title ?? t('focus.noTask')}</div><div className="text-xs text-muted">{formatDate(lang, s.started_at, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</div></div>
                <span className="tabular-nums text-muted">{formatDuration(t, s.duration_sec)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function ProjectPage() {
  const t = useT()
  const nav = useNavigate()
  const { id } = useParams()
  const projectId = Number(id)
  const [params, setParams] = useSearchParams()
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'board') as Tab
  const noteParam = params.get('note')
  const { projects, loaded, error } = useData()
  const [confirm, setConfirm] = useState<'delete' | 'archive' | null>(null)
  const project = projects.find((p) => p.id === projectId)

  if (error) return <ErrorState message={error} onRetry={() => void useData.getState().refresh()} />
  if (!loaded) return <PageLoading />
  if (!project) {
    return (
      <EmptyState className="h-full" icon={<ArrowLeft size={22} />} title={t('project.notFound')} description={t('project.notFoundText')} action={<Button variant="primary" onClick={() => nav('/projects')}>{t('project.backToList')}</Button>} />
    )
  }

  const setTab = (next: Tab) => setParams(next === 'board' ? {} : { tab: next }, { replace: true })
  const done = async (kind: 'delete' | 'archive') => {
    setConfirm(null)
    const ok = await attempt(async () => { await (kind === 'delete' ? projectsRepo.remove(project.id) : projectsRepo.archive(project.id)); return true })
    if (!ok) return
    await useData.getState().refresh()
    toast.success(t(kind === 'delete' ? 'project.deleted' : 'project.archived'))
    nav('/projects')
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-4 px-6 pb-2 pt-6">
        <button onClick={() => nav('/projects')} aria-label={t('project.backToList')} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg"><ArrowLeft size={18} /></button>
        <ProjectIcon icon={project.icon} color={project.color} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h1 className="truncate text-xl font-semibold tracking-tight">{project.name}</h1><StatusBadge status={project.status} /></div>
          {project.description && <p className="truncate text-sm text-muted">{project.description}</p>}
        </div>
        <div className="hidden w-52 flex-col gap-1 md:flex">
          <div className="flex justify-between text-xs text-muted"><span>{t('project.tasksDone', { a: project.task_done, b: project.task_total })}</span><span>{formatDuration(t, project.focus_sec)}</span></div>
          <ProgressBar value={project.task_total ? project.task_done / project.task_total : 0} color={project.color} label={project.name} />
        </div>
        <Menu label={t('project.menu')} items={[
          { label: t('project.edit'), icon: <Pencil size={14} />, onSelect: () => useUi.getState().setProjectDialog({ mode: 'edit', id: project.id }) },
          { label: t('project.archive'), icon: <Archive size={14} />, onSelect: () => setConfirm('archive'), disabled: project.status === 'archived' },
          'separator',
          { label: t('project.delete'), icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirm('delete') },
        ]} />
      </header>

      <nav role="tablist" aria-label={project.name} className="flex gap-1 border-b border-line px-6">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors', tab === k ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>
            {t(`project.tab.${k}`)}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 pt-4" role="tabpanel">
        {tab === 'board' && <Board projectId={project.id} />}
        {tab === 'notes' && <NotesWorkspace projectId={project.id} selectedId={noteParam ? Number(noteParam) : null} onSelect={(n) => setParams(n ? { tab: 'notes', note: String(n) } : { tab: 'notes' }, { replace: true })} />}
        {tab === 'files' && <FilesTab projectId={project.id} />}
        {tab === 'focus' && <FocusHistory projectId={project.id} />}
      </div>

      <ConfirmDialog open={confirm === 'delete'} title={t('project.deleteTitle')} message={t('project.deleteMessage', { name: project.name })} confirmLabel={t('common.delete')} onConfirm={() => void done('delete')} onClose={() => setConfirm(null)} />
      <ConfirmDialog open={confirm === 'archive'} title={t('project.archiveTitle')} message={t('project.archiveMessage', { name: project.name })} confirmLabel={t('project.archive')} danger={false} onConfirm={() => void done('archive')} onClose={() => setConfirm(null)} />
    </div>
  )
}
