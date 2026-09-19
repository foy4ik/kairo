import { useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ArrowLeft, ArrowRight, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Menu } from '@/components/Menu'
import { Button, IconButton } from '@/components/Button'
import { Input, Select } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import type { Column, Task } from '@/lib/types'
import { TaskCard, cardId } from './TaskCard'

export function columnKey(id: number) { return `c-${id}` }

interface Props {
  column: Column
  index: number
  count: number
  siblings: Column[]
  tasks: Task[]
  dragDisabled: boolean
  onOpenTask: (id: number) => void
  onAdd: (title: string) => Promise<void>
  onRename: (name: string) => void
  onToggleDone: () => void
  onMove: (dir: -1 | 1) => void
  onDelete: (moveTo: number | null) => void
}

export function KanbanColumn({ column, index, count, siblings, tasks, dragDisabled, onOpenTask, onAdd, onRename, onToggleDone, onMove, onDelete }: Props) {
  const t = useT()
  const { setNodeRef, isOver } = useDroppable({ id: columnKey(column.id) })
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(column.name)
  const [deleting, setDeleting] = useState(false)
  const [target, setTarget] = useState<number | ''>('')
  const addRef = useRef<HTMLInputElement>(null)

  useEffect(() => setName(column.name), [column.name])
  useEffect(() => { if (adding) addRef.current?.focus() }, [adding])

  const submit = async () => {
    const v = draft.trim()
    if (!v) return
    setDraft('')
    await onAdd(v)
    addRef.current?.focus()
  }
  const others = siblings.filter((c) => c.id !== column.id)

  return (
    <section aria-label={column.name} data-testid="kanban-column" data-column-id={column.id} className="flex h-full w-[286px] shrink-0 flex-col rounded-xl bg-surface-2/70">
      <header className="flex items-center gap-1.5 px-3 pb-1.5 pt-2.5">
        {column.is_done && <CheckCircle2 size={14} className="text-ok" aria-label={t('column.doneColumn')} />}
        {renaming ? (
          <Input
            value={name} aria-label={t('column.rename')} className="h-6 flex-1 text-sm font-semibold" autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { setRenaming(false); if (name.trim() && name.trim() !== column.name) onRename(name.trim()); else setName(column.name) }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setName(column.name); setRenaming(false) } }}
          />
        ) : (
          <h3 className="flex-1 truncate text-[13px] font-semibold">{column.name}</h3>
        )}
        <span className="rounded-full bg-surface px-1.5 text-[11px] font-medium tabular-nums text-muted" aria-label={t('tasks.count', { n: tasks.length })}>{tasks.length}</span>
        <IconButton label={t('task.add')} onClick={() => setAdding(true)}><Plus size={15} /></IconButton>
        <Menu
          label={t('column.menu')}
          items={[
            { label: t('column.rename'), icon: <Pencil size={14} />, onSelect: () => setRenaming(true) },
            { label: column.is_done ? t('column.unmarkDone') : t('column.markDone'), icon: <CheckCircle2 size={14} />, onSelect: onToggleDone },
            { label: t('column.moveLeft'), icon: <ArrowLeft size={14} />, onSelect: () => onMove(-1), disabled: index === 0 },
            { label: t('column.moveRight'), icon: <ArrowRight size={14} />, onSelect: () => onMove(1), disabled: index === count - 1 },
            'separator',
            { label: t('column.delete'), icon: <Trash2 size={14} />, danger: true, disabled: others.length === 0, onSelect: () => { setTarget(others[0]?.id ?? ''); if (tasks.length === 0) onDelete(null); else setDeleting(true) } },
          ]}
        />
      </header>

      <div ref={setNodeRef} className={cn('flex min-h-[64px] flex-1 flex-col gap-2 overflow-y-auto rounded-lg px-2 pb-2 pt-1 transition-colors duration-150', isOver && 'bg-accent-soft/60')}>
        <SortableContext items={tasks.map((x) => cardId(x.id))} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} done={column.is_done} dragDisabled={dragDisabled} onOpen={() => onOpenTask(task.id)} />
          ))}
        </SortableContext>
        {tasks.length === 0 && !adding && (
          <button onClick={() => setAdding(true)} className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-center text-xs text-muted transition-colors hover:border-accent hover:text-accent-text">
            {t('column.empty')}
          </button>
        )}
        {adding && (
          <form onSubmit={(e) => { e.preventDefault(); void submit() }} className="flex flex-col gap-1.5">
            <Input
              ref={addRef} value={draft} aria-label={t('task.title')} placeholder={t('task.quickPlaceholder')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); setDraft('') } }}
              onBlur={() => { if (!draft.trim()) setAdding(false) }}
            />
            <p className="px-0.5 text-[11px] text-muted">{t('task.quickHint')}</p>
          </form>
        )}
      </div>

      <Modal
        open={deleting} title={t('column.deleteTitle', { name: column.name })} onClose={() => setDeleting(false)}
        footer={<><Button onClick={() => setDeleting(false)}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => { setDeleting(false); onDelete(target === '' ? null : target) }}>{t('column.delete')}</Button></>}
      >
        <p className="mb-3 text-sm text-muted">{t('column.deleteMessage', { n: tasks.length })}</p>
        <Select aria-label={t('column.moveTasksTo')} value={target} onChange={(e) => setTarget(Number(e.target.value))}>
          {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Modal>
    </section>
  )
}
