import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderPlus, FolderOpen } from 'lucide-react'
import { Button } from '@/components/Button'
import { EmptyState, ErrorState, PageLoading } from '@/components/EmptyState'
import { ProjectIcon } from '@/components/Icon'
import { ProgressBar, StatusBadge } from '@/components/Chips'
import { cn } from '@/lib/utils'
import { formatDuration, formatRelative, useLang, useT } from '@/i18n'
import { useData } from '@/store/data'
import { useUi } from '@/store/ui'
import type { ProjectStatus } from '@/lib/types'

const FILTERS: Array<ProjectStatus | 'all'> = ['all', 'active', 'paused', 'completed', 'archived']

export function ProjectsPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const nav = useNavigate()
  const { projects, loaded, error } = useData()
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('all')

  if (error) return <ErrorState message={error} onRetry={() => void useData.getState().refresh()} />
  if (!loaded) return <PageLoading />

  // Archived projects stay out of the way unless asked for.
  const shown = projects.filter((p) => (filter === 'all' ? p.status !== 'archived' : p.status === filter))
  const count = (s: ProjectStatus | 'all') => projects.filter((p) => (s === 'all' ? p.status !== 'archived' : p.status === s)).length

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-5 overflow-y-auto p-8">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.projects')}</h1>
        <Button variant="primary" onClick={() => useUi.getState().setProjectDialog({ mode: 'create' })}><FolderPlus size={15} />{t('project.new')}</Button>
      </header>

      {projects.length > 0 && (
        <div role="tablist" aria-label={t('project.status')} className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
              className={cn('rounded-full px-3 py-1 text-[13px] font-medium transition-colors', filter === f ? 'bg-accent text-white' : 'bg-surface text-muted border border-line hover:text-fg')}>
              {f === 'all' ? t('projects.all') : t(`status.${f}`)} <span className="opacity-70">{count(f)}</span>
            </button>
          ))}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface">
          <EmptyState icon={<FolderOpen size={22} />} title={t('projects.emptyTitle')} description={t('projects.emptyText')}
            action={<Button variant="primary" onClick={() => useUi.getState().setProjectDialog({ mode: 'create' })}>{t('project.new')}</Button>} />
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-lg bg-surface-2 px-4 py-6 text-center text-sm text-muted">{t('projects.noneInFilter')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="project-grid">
          {shown.map((p) => (
            <button key={p.id} onClick={() => nav(`/projects/${p.id}`)} data-testid="project-card"
              className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-left shadow-card transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-line-strong">
              <div className="flex items-start gap-3">
                <ProjectIcon icon={p.icon} color={p.color} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{p.name}</div>
                  <div className="line-clamp-2 min-h-[2.4em] text-xs text-muted">{p.description || t('project.noDescription')}</div>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <ProgressBar value={p.task_total ? p.task_done / p.task_total : 0} color={p.color} label={p.name} />
              <div className="flex justify-between text-xs text-muted">
                <span>{t('project.tasksDone', { a: p.task_done, b: p.task_total })}</span>
                <span>{formatDuration(t, p.focus_sec)}</span>
                <span>{formatRelative(lang, p.updated_at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
