import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bold, CheckSquare, Code, Columns2, Eye, Heading2, Italic, Link2, List, Pencil, Quote, Trash2, X,
} from 'lucide-react'
import { IconButton } from '@/components/Button'
import { Input, Select } from '@/components/Field'
import { ConfirmDialog } from '@/components/Modal'
import { Markdown, toggleTaskInSource } from '@/components/Markdown'
import { SaveIndicator } from '@/components/SaveIndicator'
import { TagChip } from '@/components/Chips'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import { useData } from '@/store/data'
import { notesRepo } from '@/lib/repositories'
import { attempt } from '@/lib/errors'
import { toast } from '@/store/toast'
import type { Note, NoteInput } from '@/lib/types'
import { applyFormat, type Format } from './markdownFormat'
import { useAutosave } from './useAutosave'

type View = 'edit' | 'split' | 'preview'

const toInput = (n: NoteInput): NoteInput => ({ ...n, tags: [...n.tags], task_ids: [...n.task_ids] })
const serialize = (n: NoteInput) => JSON.stringify([n.title, n.content, n.project_id, n.tags, [...n.task_ids].sort()])
const fromNote = (n: Note): NoteInput => ({ title: n.title, content: n.content, project_id: n.project_id, tags: n.tags.map((x) => x.name), task_ids: n.task_ids })

/** Markdown editor with live preview and autosave. Mount with `key={note.id}` so drafts never leak between notes. */
export function NoteEditor({ note, onDeleted }: { note: Note; onDeleted: () => void }) {
  const t = useT()
  const projects = useData((s) => s.projects)
  const allTasks = useData((s) => s.tasks)
  const initial = useMemo(() => fromNote(note), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState<NoteInput>(initial)
  const [view, setView] = useState<View>('split')
  const [tagInput, setTagInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const noteId = note.id

  const persist = useCallback(async (v: NoteInput) => {
    const before = useData.getState().notes.find((n) => n.id === noteId)
    const saved = await notesRepo.save(noteId, { ...toInput(v), title: v.title.trim() || t('note.untitled') })
    useData.getState().upsertNote(saved)
    const linksChanged = JSON.stringify([...(before?.task_ids ?? [])].sort()) !== JSON.stringify([...saved.task_ids].sort())
    if (linksChanged || v.tags.length !== (before?.tags.length ?? 0)) void useData.getState().refreshTasks()
  }, [noteId, t])

  const { state, update, flush, draft } = useAutosave<NoteInput>({ initial, serialize, save: persist })

  const change = (patch: Partial<NoteInput>) => {
    const next = { ...draft.current, ...patch }
    setForm(next)
    update(next)
  }

  const format = (kind: Format) => {
    const el = area.current
    if (!el) return
    const r = applyFormat(form.content, el.selectionStart, el.selectionEnd, kind)
    change({ content: r.value })
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.start, r.end) })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return
    if (e.code === 'KeyB') { e.preventDefault(); format('bold') }
    else if (e.code === 'KeyI') { e.preventDefault(); format('italic') }
    else if (e.code === 'KeyS') { e.preventDefault(); void flush() }
  }

  // Keep the editor in sync when the note is changed elsewhere (e.g. a task link removed from the task panel).
  useEffect(() => {
    if (state !== 'saved') return
    const next = fromNote(note)
    if (serialize(next) !== serialize(draft.current)) { draft.current = next; setForm(next) }
  }, [note, state, draft])

  const projectTasks = allTasks.filter((x) => form.project_id === null || x.project_id === form.project_id)
  const linkable = projectTasks.filter((x) => !form.task_ids.includes(x.id))

  const addTags = () => {
    const names = tagInput.split(/[,\s]+/).map((s) => s.trim().replace(/^#/, '')).filter(Boolean)
    setTagInput('')
    if (!names.length) return
    change({ tags: [...new Set([...form.tags, ...names])] })
  }

  const remove = async () => {
    setConfirmDelete(false)
    const ok = await attempt(async () => { await notesRepo.remove(note.id); return true })
    if (!ok) return
    await Promise.all([useData.getState().refreshNotes(), useData.getState().refreshTasks()])
    toast.success(t('note.deleted'))
    onDeleted()
  }

  const tools: Array<{ kind: Format; icon: React.ReactNode; label: string }> = [
    { kind: 'bold', icon: <Bold size={15} />, label: t('md.bold') },
    { kind: 'italic', icon: <Italic size={15} />, label: t('md.italic') },
    { kind: 'heading', icon: <Heading2 size={15} />, label: t('md.heading') },
    { kind: 'list', icon: <List size={15} />, label: t('md.list') },
    { kind: 'checkbox', icon: <CheckSquare size={15} />, label: t('md.checkbox') },
    { kind: 'quote', icon: <Quote size={15} />, label: t('md.quote') },
    { kind: 'code', icon: <Code size={15} />, label: t('md.code') },
    { kind: 'link', icon: <Link2 size={15} />, label: t('md.link') },
  ]

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col" data-testid="note-editor">
      <div className="flex items-center gap-3 border-b border-line px-6 py-3">
        <Input
          aria-label={t('note.title')} value={form.title} maxLength={200} placeholder={t('note.titlePlaceholder')}
          className="h-9 border-transparent bg-transparent px-0 text-xl font-semibold hover:border-transparent focus:ring-0"
          onChange={(e) => change({ title: e.target.value })}
        />
        <SaveIndicator state={state} onRetry={() => void flush()} />
        <div role="radiogroup" aria-label={t('note.view')} className="flex rounded-md border border-line bg-surface-2 p-0.5">
          {([['edit', <Pencil size={14} key="e" />, t('note.viewEdit')], ['split', <Columns2 size={14} key="s" />, t('note.viewSplit')], ['preview', <Eye size={14} key="p" />, t('note.viewPreview')]] as Array<[View, React.ReactNode, string]>).map(([v, icon, label]) => (
            <button key={v} role="radio" aria-checked={view === v} aria-label={label} title={label} onClick={() => setView(v)} className={cn('flex h-6 w-7 items-center justify-center rounded', view === v ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}>{icon}</button>
          ))}
        </div>
        <IconButton label={t('common.delete')} onClick={() => setConfirmDelete(true)}><Trash2 size={15} /></IconButton>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-2 text-sm">
        <label className="flex items-center gap-2 text-xs text-muted">
          {t('note.project')}
          <Select value={form.project_id ?? ''} className="h-7 w-44" onChange={(e) => {
            const project_id = e.target.value ? Number(e.target.value) : null
            // Keep only links that still make sense inside the new project.
            change({ project_id, task_ids: project_id === null ? form.task_ids : form.task_ids.filter((id) => allTasks.find((x) => x.id === id)?.project_id === project_id) })
          }}>
            <option value="">{t('note.noProject')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {form.tags.map((g) => <TagChip key={g} tag={{ name: g, color: '#6366f1' }} onRemove={() => change({ tags: form.tags.filter((x) => x !== g) })} />)}
          <Input aria-label={t('task.addTag')} placeholder={t('task.addTag')} className="h-6 w-28 text-xs" value={tagInput}
            onChange={(e) => setTagInput(e.target.value)} onBlur={addTags}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTags() } }} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">{t('note.tasks')}</span>
          {form.task_ids.map((id) => {
            const task = allTasks.find((x) => x.id === id)
            return task ? (
              <span key={id} className="inline-flex max-w-48 items-center gap-1 rounded bg-surface-2 px-1.5 py-px text-[11px] font-medium">
                <span className="truncate">{task.title}</span>
                <button aria-label={t('task.unlink')} className="text-muted hover:text-fg" onClick={() => change({ task_ids: form.task_ids.filter((x) => x !== id) })}><X size={11} /></button>
              </span>
            ) : null
          })}
          {linkable.length > 0 && (
            <Select aria-label={t('note.linkTask')} className="h-6 w-36 text-xs" value="" onChange={(e) => e.target.value && change({ task_ids: [...form.task_ids, Number(e.target.value)] })}>
              <option value="">{t('note.linkTask')}…</option>
              {linkable.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </Select>
          )}
        </div>
      </div>

      {view !== 'preview' && (
        <div role="toolbar" aria-label={t('md.toolbar')} className="flex items-center gap-0.5 border-b border-line px-5 py-1">
          {tools.map((tool) => <IconButton key={tool.kind} label={tool.label} onClick={() => format(tool.kind)}>{tool.icon}</IconButton>)}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {view !== 'preview' && (
          <textarea
            ref={area} value={form.content} spellCheck={false} aria-label={t('note.content')} placeholder={t('note.contentPlaceholder')}
            onChange={(e) => change({ content: e.target.value })} onKeyDown={onKeyDown}
            className={cn('selectable h-full resize-none bg-surface px-6 py-4 font-mono text-[13px] leading-relaxed text-fg placeholder:text-muted focus:outline-none', view === 'split' ? 'w-1/2 border-r border-line' : 'w-full')}
          />
        )}
        {view !== 'edit' && (
          <div className={cn('h-full overflow-y-auto bg-surface px-8 py-4', view === 'split' ? 'w-1/2' : 'w-full')} data-testid="note-preview">
            {form.content.trim() ? (
              <Markdown source={form.content} onToggleTask={(i) => change({ content: toggleTaskInSource(form.content, i) })} />
            ) : (
              <p className="text-sm text-muted">{t('note.previewEmpty')}</p>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog open={confirmDelete} title={t('note.deleteTitle')} message={t('note.deleteMessage', { name: form.title })} confirmLabel={t('common.delete')} onConfirm={() => void remove()} onClose={() => setConfirmDelete(false)} />
    </div>
  )
}
