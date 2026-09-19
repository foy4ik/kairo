import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Play, Plus, Trash2, X } from 'lucide-react'
import { SidePanel, ConfirmDialog } from '@/components/Modal'
import { Button, IconButton } from '@/components/Button'
import { Input, Select, Textarea } from '@/components/Field'
import { ProgressBar, TagChip } from '@/components/Chips'
import { SaveIndicator, type SaveState } from '@/components/SaveIndicator'
import { formatDate, formatDuration, useLang, useT } from '@/i18n'
import { useUi } from '@/store/ui'
import { useData } from '@/store/data'
import { useTimer } from '@/store/timer'
import { notesRepo, projectsRepo, tasksRepo, timerRepo } from '@/lib/repositories'
import { attempt } from '@/lib/errors'
import { toast } from '@/store/toast'
import { cn } from '@/lib/utils'
import type { Column, FocusSession, Priority, Task, TaskPatch } from '@/lib/types'

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4 first:border-t-0">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function TaskPanel() {
  const id = useUi((s) => s.taskPanelId)
  const close = useCallback(() => useUi.getState().openTask(null), [])
  const task = useData((s) => s.tasks.find((x) => x.id === id))
  const t = useT()
  // A task deleted elsewhere closes its panel.
  useEffect(() => { if (id !== null && !task && useData.getState().loaded) close() }, [id, task, close])
  return (
    <SidePanel open={id !== null && !!task} title={t('task.details')} onClose={close}>
      {task && <TaskDetails key={task.id} task={task} onClose={close} />}
    </SidePanel>
  )
}

function TaskDetails({ task, onClose }: { task: Task; onClose: () => void }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const nav = useNavigate()
  const notes = useData((s) => s.notes)
  const projects = useData((s) => s.projects)
  const sessionsVersion = useTimer((s) => s.sessionsVersion)
  const [columns, setColumns] = useState<Column[]>([])
  const [sessions, setSessions] = useState<FocusSession[]>([])
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [tagInput, setTagInput] = useState('')
  const [checkInput, setCheckInput] = useState('')
  const [save, setSave] = useState<SaveState>('saved')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const project = projects.find((p) => p.id === task.project_id)
  // Edits are sent one at a time: each response carries the whole task, so out-of-order replies would show stale data.
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(fn, fn)
    queue.current = next.catch(() => undefined)
    return next
  }

  useEffect(() => { setTitle(task.title); setDescription(task.description) }, [task.title, task.description])
  useEffect(() => { void projectsRepo.columns(task.project_id).then(setColumns) }, [task.project_id])
  useEffect(() => { void timerRepo.sessions(null, task.id, 50).then(setSessions) }, [task.id, sessionsVersion])

  const commit = async (patch: TaskPatch) => {
    setSave('saving')
    const saved = await serial(() => attempt(() => tasksRepo.update(task.id, patch)))
    if (saved) { useData.getState().upsertTask(saved); setSave('saved') } else setSave('error')
  }
  const replace = (updated: Task | undefined) => {
    if (updated) useData.getState().upsertTask(updated)
  }

  const addTags = async () => {
    const names = tagInput.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
    setTagInput('')
    if (!names.length) return
    await commit({ tags: [...task.tags.map((x) => x.name), ...names] })
    void useData.getState().refreshTasks()
  }

  const linked = notes.filter((n) => task.note_ids.includes(n.id))
  const linkable = notes.filter((n) => !task.note_ids.includes(n.id))
  const done = task.subtasks.filter((s) => s.completed).length
  const focusSec = sessions.filter((s) => s.type === 'work').reduce((a, s) => a + s.duration_sec, 0)

  const move = async (columnId: number) => {
    const count = useData.getState().tasks.filter((x) => x.column_id === columnId && x.id !== task.id).length
    const moved = await attempt(() => tasksRepo.move(task.id, columnId, count))
    if (moved) { await useData.getState().refreshTasks() }
  }

  const startFocus = async () => {
    await useTimer.getState().start('work', task.id)
    onClose()
    nav('/focus')
  }

  const newLinkedNote = async () => {
    const n = await attempt(() => notesRepo.create({ title: task.title, content: `# ${task.title}\n\n`, project_id: task.project_id, tags: [], task_ids: [task.id] }))
    if (!n) return
    await Promise.all([useData.getState().refreshNotes(), useData.getState().refreshTasks()])
    onClose()
    nav(`/notes/${n.id}`)
  }

  const remove = async () => {
    const ok = await attempt(() => tasksRepo.remove(task.id))
    setConfirmDelete(false)
    if (ok === undefined) return
    onClose()
    await useData.getState().refreshTasks()
    toast.success(t('task.deleted'))
  }

  return (
    <div className="flex flex-col" data-testid="task-panel">
      <div className="px-5 pb-3 pt-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted">{project?.name}</span>
          <SaveIndicator state={save} onRetry={() => void commit({})} />
        </div>
        <Input
          aria-label={t('task.title')} value={title} maxLength={300}
          className="h-auto border-transparent bg-transparent px-0 text-lg font-semibold hover:border-transparent focus:ring-0"
          onChange={(e) => { setTitle(e.target.value); setSave('dirty') }}
          onBlur={() => { const v = title.trim(); if (v && v !== task.title) void commit({ title: v }); else setTitle(task.title) }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <Textarea
          aria-label={t('task.description')} rows={3} value={description} placeholder={t('task.descriptionPlaceholder')}
          className="mt-1" onChange={(e) => { setDescription(e.target.value); setSave('dirty') }}
          onBlur={() => description !== task.description && void commit({ description })}
        />
      </div>

      <Section title={t('task.properties')}>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            {t('task.column')}
            <Select value={task.column_id} onChange={(e) => void move(Number(e.target.value))}>
              {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            {t('task.priority')}
            <Select value={task.priority} onChange={(e) => void commit({ priority: e.target.value as Priority })}>
              {(['low', 'medium', 'high'] as Priority[]).map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </Select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
            {t('task.due')}
            <div className="flex gap-2">
              <Input type="date" value={task.due_at?.slice(0, 10) ?? ''} onChange={(e) => void commit({ due_at: e.target.value || null })} />
              {task.due_at && <Button onClick={() => void commit({ due_at: null })}>{t('common.clear')}</Button>}
            </div>
          </label>
        </div>
      </Section>

      <Section title={t('task.tags')}>
        <div className="flex flex-wrap items-center gap-1.5">
          {task.tags.map((tag) => (
            <TagChip key={tag.id} tag={tag} onRemove={() => void commit({ tags: task.tags.filter((x) => x.id !== tag.id).map((x) => x.name) })} />
          ))}
          <Input
            aria-label={t('task.addTag')} placeholder={t('task.addTag')} value={tagInput} className="h-6 w-28 text-xs"
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); void addTags() } }}
            onBlur={() => void addTags()}
          />
        </div>
      </Section>

      <Section
        title={`${t('task.checklist')}${task.subtasks.length ? ` · ${done}/${task.subtasks.length}` : ''}`}
      >
        {task.subtasks.length > 0 && <div className="mb-2"><ProgressBar value={done / task.subtasks.length} label={t('task.checklist')} /></div>}
        <ul className="flex flex-col">
          {task.subtasks.map((s) => (
            <li key={s.id} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-surface-2">
              <input
                type="checkbox" checked={s.completed} aria-label={s.title} className="h-4 w-4 accent-[var(--c-accent)]"
                onChange={async () => {
                  // Optimistic: the checkbox flips at once; the backend answer (or a refresh on failure) is authoritative.
                  replace({ ...task, subtasks: task.subtasks.map((x) => (x.id === s.id ? { ...x, completed: !s.completed } : x)) })
                  const saved = await serial(() => attempt(() => tasksRepo.updateSubtask(s.id, { completed: !s.completed })))
                  if (saved) replace(saved); else void useData.getState().refreshTasks()
                }}
              />
              <span className={cn('flex-1 text-sm', s.completed && 'text-muted line-through')}>{s.title}</span>
              <IconButton label={t('common.delete')} className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={async () => replace(await serial(() => attempt(() => tasksRepo.removeSubtask(s.id))))}>
                <X size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
        <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const v = checkInput.trim(); if (!v) return; setCheckInput(''); replace(await serial(() => attempt(() => tasksRepo.addSubtask(task.id, v)))) }}>
          <Input aria-label={t('task.addChecklist')} placeholder={t('task.addChecklist')} value={checkInput} onChange={(e) => setCheckInput(e.target.value)} />
          <Button type="submit" disabled={!checkInput.trim()}><Plus size={14} />{t('common.add')}</Button>
        </form>
      </Section>

      <Section title={t('task.notes')} action={<Button size="sm" variant="ghost" onClick={() => void newLinkedNote()}><Plus size={13} />{t('task.newNote')}</Button>}>
        {linked.length === 0 && <p className="text-sm text-muted">{t('task.noNotes')}</p>}
        <ul className="flex flex-col gap-1">
          {linked.map((n) => (
            <li key={n.id} className="group flex items-center gap-2">
              <button className="flex flex-1 items-center gap-2 truncate rounded px-1.5 py-1 text-left text-sm hover:bg-surface-2" onClick={() => { onClose(); nav(`/notes/${n.id}`) }}>
                <FileText size={14} className="shrink-0 text-muted" aria-hidden /><span className="truncate">{n.title}</span>
              </button>
              <IconButton label={t('task.unlink')} className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => void commit({ note_ids: task.note_ids.filter((x) => x !== n.id) }).then(() => useData.getState().refreshNotes())}>
                <X size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
        {linkable.length > 0 && (
          <Select aria-label={t('task.linkNote')} className="mt-2" value="" onChange={(e) => { const nid = Number(e.target.value); if (nid) void commit({ note_ids: [...task.note_ids, nid] }).then(() => useData.getState().refreshNotes()) }}>
            <option value="">{t('task.linkNote')}…</option>
            {linkable.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
          </Select>
        )}
      </Section>

      <Section title={t('nav.focus')} action={<Button size="sm" variant="primary" onClick={() => void startFocus()}><Play size={12} />{t('focus.startOnTask')}</Button>}>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted">{t('task.noSessions')}</p>
        ) : (
          <>
            <p className="mb-2 text-sm">{t('task.totalFocus')}: <b>{formatDuration(t, focusSec)}</b></p>
            <ul className="flex flex-col gap-0.5 text-sm text-muted">
              {sessions.slice(0, 5).map((s) => (
                <li key={s.id} className="flex justify-between">
                  <span>{formatDate(lang, s.started_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span>{formatDuration(t, s.duration_sec)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <div className="flex items-center justify-between border-t border-line px-5 py-3">
        <span className="text-xs text-muted">{t('task.createdAt', { date: formatDate(lang, task.created_at, { day: 'numeric', month: 'long', year: 'numeric' }) })}</span>
        <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 size={13} />{t('common.delete')}</Button>
      </div>
      <ConfirmDialog
        open={confirmDelete} title={t('task.deleteTitle')} message={t('task.deleteMessage', { name: task.title })}
        confirmLabel={t('common.delete')} onConfirm={() => void remove()} onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}
