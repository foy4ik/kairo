import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, pointerWithin, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { ArrowDownWideNarrow, Filter, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { Input, Select } from '@/components/Field'
import { EmptyState, ErrorState, Spinner } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/Modal'
import { useT } from '@/i18n'
import { useData } from '@/store/data'
import { useUi } from '@/store/ui'
import { projectsRepo, tasksRepo } from '@/lib/repositories'
import { attempt } from '@/lib/errors'
import { toast } from '@/store/toast'
import { dueState } from '@/lib/utils'
import type { Column, Priority, Task } from '@/lib/types'
import { KanbanColumn, columnKey } from './KanbanColumn'
import { diffOrder, sortByUrgency } from './smartSort'
import { CardOverlay, cardId } from './TaskCard'
import { parseQuickAdd } from './quickAdd'
import { KanbanSquare } from 'lucide-react'

type Items = Record<string, string[]>

/** The pointer decides the target column; corner distance is only a fallback (keyboard drags). */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length ? hits : closestCorners(args)
}
interface Filters { text: string; tag: string; due: 'all' | 'overdue' | 'today' | 'week' | 'none'; priority: '' | Priority; column: number | '' }
const NO_FILTERS: Filters = { text: '', tag: '', due: 'all', priority: '', column: '' }

export function matchesFilters(task: Task, f: Filters, done: boolean): boolean {
  const q = f.text.trim().toLowerCase()
  if (q && !task.title.toLowerCase().includes(q) && !task.description.toLowerCase().includes(q) && !task.tags.some((x) => x.name.toLowerCase().includes(q))) return false
  if (f.tag && !task.tags.some((x) => x.name === f.tag)) return false
  if (f.priority && task.priority !== f.priority) return false
  if (f.column !== '' && task.column_id !== f.column) return false // "status" of a task = the column it is in
  if (f.due !== 'all') {
    const s = dueState(task.due_at, done)
    if (f.due === 'none' && task.due_at) return false
    if (f.due === 'overdue' && s !== 'overdue') return false
    if (f.due === 'today' && s !== 'today') return false
    if (f.due === 'week' && !(s === 'today' || s === 'soon' || s === 'overdue')) return false
  }
  return true
}

/** Kanban board of one project: columns, filters, quick add and drag & drop with persistent order. */
export function Board({ projectId }: { projectId: number }) {
  const t = useT()
  const allTasks = useData((s) => s.tasks)
  const tags = useData((s) => s.tags)
  const loaded = useData((s) => s.loaded)
  const openTask = useUi((s) => s.openTask)
  const [columns, setColumns] = useState<Column[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dragItems, setDragItemsState] = useState<Items | null>(null)
  // Mirrors the drag state synchronously: pointer events can outrun React renders, so handlers read the ref.
  const dragRef = useRef<Items | null>(null)
  const dragSession = useRef(0)
  const origin = useRef<{ container: string; index: number } | null>(null)
  // Moves are sent one after another so quick successive drags reach the database in order.
  const moveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const setDragItems = useCallback((next: Items | null | ((prev: Items | null) => Items | null)) => {
    dragRef.current = typeof next === 'function' ? next(dragRef.current) : next
    setDragItemsState(dragRef.current)
  }, [])
  const [newColumn, setNewColumn] = useState<string | null>(null)
  const [confirmSortAll, setConfirmSortAll] = useState(false)

  const loadColumns = useCallback(async () => {
    try { setColumns(await projectsRepo.columns(projectId)); setError(null) } catch (e) { setError((e as { message?: string }).message ?? 'error') }
  }, [projectId])
  useEffect(() => { setColumns(null); void loadColumns() }, [loadColumns])

  const tasks = useMemo(() => allTasks.filter((x) => x.project_id === projectId), [allTasks, projectId])
  const byId = useMemo(() => new Map(tasks.map((x) => [x.id, x])), [tasks])
  const doneCols = useMemo(() => new Set((columns ?? []).filter((c) => c.is_done).map((c) => c.id)), [columns])
  const filtering = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)

  const baseItems: Items = useMemo(() => {
    const out: Items = {}
    for (const c of columns ?? []) out[columnKey(c.id)] = []
    for (const task of tasks) {
      const k = columnKey(task.column_id)
      if (k in out && matchesFilters(task, filters, doneCols.has(task.column_id))) out[k].push(cardId(task.id))
    }
    return out
  }, [columns, tasks, filters, doneCols])

  const items = dragItems ?? baseItems
  const taskOf = (cid: string) => byId.get(Number(cid.slice(2)))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  )

  const findContainer = (id: string, from: Items): string | undefined =>
    id in from ? id : Object.keys(from).find((k) => from[k].includes(id))

  const onDragStart = (e: DragStartEvent) => {
    // Start from what is on screen (a previous drop may still be saving), not from the not-yet-refreshed cache.
    const start = dragRef.current ?? baseItems
    const aid = String(e.active.id)
    const c = findContainer(aid, start)
    origin.current = c ? { container: c, index: start[c].indexOf(aid) } : null
    dragSession.current++
    setActiveId(aid)
    setDragItems(start)
  }

  /** Moves the dragged card into the container under the pointer (no-op inside the same container). */
  const moveAcross = (prev: Items, active: DragOverEvent['active'], over: NonNullable<DragOverEvent['over']>): Items => {
    const from = findContainer(String(active.id), prev)
    const to = findContainer(String(over.id), prev)
    if (!from || !to || from === to) return prev
    const toItems = prev[to]
    let index: number
    if (String(over.id) in prev) index = toItems.length
    else {
      const overIndex = toItems.indexOf(String(over.id))
      const translated = active.rect.current.translated
      const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false
      index = overIndex + (below ? 1 : 0)
    }
    return { ...prev, [from]: prev[from].filter((x) => x !== String(active.id)), [to]: [...toItems.slice(0, index), String(active.id), ...toItems.slice(index)] }
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (over) setDragItems((prev) => (prev ? moveAcross(prev, active, over) : prev))
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    setActiveId(null)
    // dnd-kit reports `over` changes in an effect, so a fast drop can arrive before the last onDragOver: apply it here too.
    const current = dragRef.current && over ? moveAcross(dragRef.current, active, over) : dragRef.current
    if (!current || !over) { setDragItems(null); return }
    const aid = String(active.id)
    const from = findContainer(aid, current)
    const to = findContainer(String(over.id), current)
    let final = current
    if (from && to && from === to) {
      const oldIndex = current[from].indexOf(aid)
      const newIndex = current[to].indexOf(String(over.id))
      if (newIndex >= 0 && oldIndex !== newIndex) final = { ...current, [to]: arrayMove(current[to], oldIndex, newIndex) }
    }
    const container = findContainer(aid, final)
    const before = origin.current
    if (!container || !before) { setDragItems(null); return }
    const index = final[container].indexOf(aid)
    const session = dragSession.current
    setDragItems(final)
    if (container !== before.container || index !== before.index) {
      moveQueue.current = moveQueue.current.then(async () => {
        await attempt(() => tasksRepo.move(Number(aid.slice(2)), Number(container.slice(2)), index))
        await useData.getState().refreshTasks()
      })
      await moveQueue.current
    }
    // A new drag may have started while the move was being saved: only the latest drag owns the state.
    if (dragSession.current === session) setDragItems(null)
  }

  const addTask = async (columnId: number, raw: string) => {
    const q = parseQuickAdd(raw)
    if (!q.title) return
    const created = await attempt(() => tasksRepo.create({ project_id: projectId, column_id: columnId, title: q.title, priority: q.priority ?? 'medium', tags: q.tags }))
    if (created) await useData.getState().refreshTasks()
  }

  /** Reorders one column in place by due date and priority (see smartSort). Uses the same move queue as
   *  drag & drop, so it never races a drag that is still saving, and only sends the moves actually needed. */
  const sortColumn = async (columnId: number) => {
    const currentIds = (items[columnKey(columnId)] ?? []).map((cid) => Number(cid.slice(2)))
    const current = currentIds.map((id) => byId.get(id)).filter((x): x is Task => !!x)
    const targetIds = sortByUrgency(current).map((x) => x.id)
    const moves = diffOrder(currentIds, targetIds)
    if (!moves.length) return
    moveQueue.current = moveQueue.current.then(async () => {
      for (const m of moves) await attempt(() => tasksRepo.move(m.id, columnId, m.index))
      await useData.getState().refreshTasks()
    })
    await moveQueue.current
  }
  const sortAll = async () => { for (const c of columns ?? []) await sortColumn(c.id) }

  const columnAction = async (fn: () => Promise<unknown>) => {
    const ok = await attempt(async () => { await fn(); return true })
    if (ok) { await loadColumns(); await useData.getState().refreshTasks() }
  }

  const moveColumn = (index: number, dir: -1 | 1) => {
    if (!columns) return
    const next = arrayMove(columns, index, index + dir)
    setColumns(next)
    void columnAction(() => projectsRepo.reorderColumns(projectId, next.map((c) => c.id)))
  }

  if (error) return <ErrorState message={error} onRetry={() => void loadColumns()} />
  if (!columns || !loaded) return <div className="flex justify-center p-16"><Spinner /></div>

  const activeTask = activeId ? taskOf(activeId) : undefined
  const emptyBoard = tasks.length === 0
  const visible = Object.values(baseItems).reduce((a, l) => a + l.length, 0)
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
        <div className="relative w-56">
          <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <Input aria-label={t('filters.search')} placeholder={t('filters.search')} className="pl-8" value={filters.text} onChange={(e) => set({ text: e.target.value })} />
        </div>
        <Select aria-label={t('task.tags')} className="w-36" value={filters.tag} onChange={(e) => set({ tag: e.target.value })}>
          <option value="">{t('filters.allTags')}</option>
          {tags.map((g) => <option key={g.id} value={g.name}>#{g.name}</option>)}
        </Select>
        <Select aria-label={t('filters.statusLabel')} data-testid="filter-status" className="w-40" value={filters.column} onChange={(e) => set({ column: e.target.value ? Number(e.target.value) : '' })}>
          <option value="">{t('filters.anyStatus')}</option>
          {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label={t('task.due')} className="w-40" value={filters.due} onChange={(e) => set({ due: e.target.value as Filters['due'] })}>
          <option value="all">{t('filters.anyDue')}</option>
          <option value="overdue">{t('filters.overdue')}</option>
          <option value="today">{t('filters.today')}</option>
          <option value="week">{t('filters.week')}</option>
          <option value="none">{t('filters.noDue')}</option>
        </Select>
        <Select aria-label={t('task.priority')} className="w-48" value={filters.priority} onChange={(e) => set({ priority: e.target.value as Filters['priority'] })}>
          <option value="">{t('filters.anyPriority')}</option>
          {(['high', 'medium', 'low'] as Priority[]).map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
        </Select>
        <Button size="sm" variant="ghost" onClick={() => setConfirmSortAll(true)} disabled={emptyBoard || filtering} title={t('board.sortAllHint')}>
          <ArrowDownWideNarrow size={14} />{t('board.sortAll')}
        </Button>
        {filtering && (
          <>
            <span className="flex items-center gap-1 text-xs text-muted"><Filter size={12} aria-hidden />{t('filters.shown', { a: visible, b: tasks.length })}</span>
            <Button size="sm" variant="ghost" onClick={() => setFilters(NO_FILTERS)}><X size={13} />{t('filters.clear')}</Button>
          </>
        )}
      </div>

      {emptyBoard && (
        <div className="mx-6 mb-3 rounded-xl border border-dashed border-line-strong bg-surface">
          <EmptyState
            className="py-8" icon={<KanbanSquare size={22} />} title={t('board.emptyTitle')} description={t('board.emptyText')}
            action={<Button variant="primary" onClick={() => useUi.getState().openNewTask({ projectId, columnId: columns[0]?.id })}><Plus size={14} />{t('task.new')}</Button>}
          />
        </div>
      )}
      {!emptyBoard && filtering && visible === 0 && (
        <p className="mx-6 mb-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">{t('filters.noResults')}</p>
      )}
      {filtering && visible > 0 && <p className="mx-6 mb-2 text-xs text-muted">{t('filters.dragOff')}</p>}

      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={(e) => void onDragEnd(e)} onDragCancel={() => { setActiveId(null); setDragItems(null) }}>
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-6 pb-6" data-testid="board">
          {columns.map((c, i) => (
            <KanbanColumn
              key={c.id} column={c} index={i} count={columns.length} siblings={columns}
              tasks={(items[columnKey(c.id)] ?? []).map(taskOf).filter((x): x is Task => !!x)}
              dragDisabled={filtering}
              onOpenTask={openTask}
              onAdd={(title) => addTask(c.id, title)}
              onRename={(name) => void columnAction(() => projectsRepo.updateColumn(c.id, { name }))}
              onToggleDone={() => void columnAction(() => projectsRepo.updateColumn(c.id, { is_done: !c.is_done }))}
              onMove={(dir) => moveColumn(i, dir)}
              onSort={() => void sortColumn(c.id)}
              onDelete={(moveTo) => void columnAction(() => projectsRepo.deleteColumn(c.id, moveTo)).then(() => toast.success(t('column.deleted')))}
            />
          ))}
          <div className="w-[240px] shrink-0">
            {newColumn === null ? (
              <Button className="w-full justify-start" variant="ghost" onClick={() => setNewColumn('')}><Plus size={14} />{t('column.add')}</Button>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); const v = newColumn.trim(); setNewColumn(null); if (v) void columnAction(() => projectsRepo.createColumn(projectId, v)) }}>
                <Input autoFocus aria-label={t('column.name')} placeholder={t('column.name')} value={newColumn} onChange={(e) => setNewColumn(e.target.value)} onBlur={() => setNewColumn(null)} onKeyDown={(e) => e.key === 'Escape' && setNewColumn(null)} />
              </form>
            )}
          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 180 }}>
          {activeTask ? <CardOverlay task={activeTask} done={doneCols.has(activeTask.column_id)} /> : null}
        </DragOverlay>
      </DndContext>

      <ConfirmDialog
        open={confirmSortAll} title={t('board.sortAll')} message={t('board.sortAllConfirmMessage')}
        confirmLabel={t('board.sortAllConfirm')} danger={false}
        onConfirm={() => { setConfirmSortAll(false); void sortAll() }}
        onClose={() => setConfirmSortAll(false)}
      />
    </div>
  )
}
