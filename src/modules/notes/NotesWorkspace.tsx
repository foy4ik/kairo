import { useEffect, useMemo, useState } from 'react'
import { FilePlus2, FileText, Search } from 'lucide-react'
import { Button } from '@/components/Button'
import { Input, Select } from '@/components/Field'
import { EmptyState } from '@/components/EmptyState'
import { TagChip } from '@/components/Chips'
import { cn, debounce } from '@/lib/utils'
import { formatRelative, useLang, useT } from '@/i18n'
import { useData } from '@/store/data'
import { notesRepo } from '@/lib/repositories'
import { attempt } from '@/lib/errors'
import type { Note } from '@/lib/types'
import { NoteEditor } from './NoteEditor'
import { snippet } from './markdownFormat'

interface Props {
  /** When set, the workspace is scoped to one project (project "Notes" tab). */
  projectId?: number
  selectedId: number | null
  onSelect: (id: number | null) => void
}

/** Notes list (search, tag/project filters) + editor. Used by the Notes page and inside a project. */
export function NotesWorkspace({ projectId, selectedId, onSelect }: Props) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const notes = useData((s) => s.notes)
  const projects = useData((s) => s.projects)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Note[] | null>(null)
  const [tag, setTag] = useState('')
  const [project, setProject] = useState<number | ''>('')

  // Full-text search runs in the backend (content, title, tags); the list itself comes from the cache.
  useEffect(() => {
    const q = query.trim()
    if (!q) { setHits(null); return }
    const run = debounce(async () => setHits((await attempt(() => notesRepo.search(q))) ?? []), 150)
    run()
    return () => run.cancel()
  }, [query, notes])

  const scoped = useMemo(() => {
    const base = hits ?? notes
    return base.filter((n) => {
      if (projectId !== undefined && n.project_id !== projectId) return false
      if (project !== '' && n.project_id !== project) return false
      if (tag && !n.tags.some((x) => x.name === tag)) return false
      return true
    })
  }, [hits, notes, projectId, project, tag])

  const allTags = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of notes) if (projectId === undefined || n.project_id === projectId) for (const g of n.tags) m.set(g.name, (m.get(g.name) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  }, [notes, projectId])

  const selected = notes.find((n) => n.id === selectedId) ?? null
  const createNote = async () => {
    const n = await attempt(() => notesRepo.create({ title: t('note.untitled'), content: '', project_id: projectId ?? (project === '' ? null : project), tags: [], task_ids: [] }))
    if (!n) return
    await useData.getState().refreshNotes()
    setQuery('')
    onSelect(n.id)
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-surface" aria-label={t('nav.notes')}>
        <div className="flex flex-col gap-2 border-b border-line p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <Input aria-label={t('notes.search')} placeholder={t('notes.search')} className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Button variant="primary" onClick={() => void createNote()} aria-label={t('note.new')} title={t('note.new')}><FilePlus2 size={15} /></Button>
          </div>
          {projectId === undefined && projects.length > 0 && (
            <Select aria-label={t('note.project')} value={project} onChange={(e) => setProject(e.target.value ? Number(e.target.value) : '')}>
              <option value="">{t('notes.allProjects')}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          )}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1" role="group" aria-label={t('task.tags')}>
              {allTags.slice(0, 8).map((g) => (
                <button key={g} aria-pressed={tag === g} onClick={() => setTag(tag === g ? '' : g)} className={cn('rounded px-1.5 py-px text-[11px] font-medium transition-colors', tag === g ? 'bg-accent text-white' : 'bg-surface-2 text-muted hover:text-fg')}>#{g}</button>
              ))}
            </div>
          )}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="note-list">
          {scoped.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => onSelect(n.id)} aria-current={n.id === selectedId}
                className={cn('flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors', n.id === selectedId ? 'bg-accent-soft' : 'hover:bg-surface-2')}
              >
                <span className="truncate text-sm font-medium">{n.title}</span>
                <span className="line-clamp-2 text-xs text-muted">{snippet(n.content) || t('note.empty')}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                  {formatRelative(lang, n.updated_at)}
                  {n.tags.slice(0, 2).map((g) => <TagChip key={g.id} tag={g} />)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {scoped.length === 0 && (
          <div className="px-3 pb-6">
            {notes.length === 0 || (projectId !== undefined && !notes.some((n) => n.project_id === projectId)) ? (
              <EmptyState className="py-8" icon={<FileText size={20} />} title={t('notes.emptyTitle')} description={t('notes.emptyText')} action={<Button variant="primary" onClick={() => void createNote()}>{t('note.new')}</Button>} />
            ) : (
              <EmptyState className="py-8" icon={<Search size={20} />} title={t('search.noResults')} description={query ? t('search.noResultsFor', { q: query }) : undefined} />
            )}
          </div>
        )}
      </aside>

      <div className="min-w-0 flex-1 bg-surface">
        {selected ? (
          <NoteEditor key={selected.id} note={selected} onDeleted={() => onSelect(null)} />
        ) : (
          <EmptyState className="h-full" icon={<FileText size={22} />} title={t('notes.selectTitle')} description={t('notes.selectText')} />
        )}
      </div>
    </div>
  )
}
